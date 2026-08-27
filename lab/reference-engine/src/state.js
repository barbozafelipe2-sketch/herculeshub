import crypto from "node:crypto";
import { EngineStateSchema } from "./schema.js";

const AUTHORIZED_SAFETY_RELEASE_AUTHORITIES = new Set([
  "HUMAN_REVIEWER",
  "QUALIFIED_PROFESSIONAL"
]);

export class IntegrityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IntegrityError";
    this.code = code;
  }
}

export class ConcurrencyConflict extends Error {
  constructor(expected, actual) {
    super(`Stale writer: expected base ${expected}, current commit ${actual}`);
    this.name = "ConcurrencyConflict";
    this.code = "STALE_WRITER";
    this.expected = expected;
    this.actual = actual;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function fingerprintFor(stateLike) {
  const copy = structuredClone(stateLike);
  delete copy.fingerprint;
  return crypto.createHash("sha256").update(stableStringify(copy)).digest("hex");
}

export function withFingerprint(stateLike) {
  const copy = structuredClone(stateLike);
  copy.fingerprint = fingerprintFor(copy);
  return copy;
}

export function createState({ clientNamespace, activePlanVersionId }) {
  const seed = {
    client_namespace: clientNamespace,
    active_plan_version_id: activePlanVersionId,
    revision: 0,
    commit_id: "commit-0",
    base_commit_id: null,
    open_gates: [],
    closed_gates: [],
    consumed_event_ids: [],
    rejected_events: [],
    live_adds: [],
    live_removes: [],
    fingerprint: "pending"
  };
  return EngineStateSchema.parse(withFingerprint(seed));
}

function nextCommit(state) {
  const nextRevision = state.revision + 1;
  return `commit-${nextRevision}-${crypto.randomBytes(6).toString("hex")}`;
}

export function validateState(state) {
  const parsed = EngineStateSchema.parse(state);
  const expected = fingerprintFor(parsed);
  if (parsed.fingerprint !== expected) {
    throw new IntegrityError("FINGERPRINT_MISMATCH", "Persisted state fingerprint does not match content.");
  }
  return parsed;
}

export function acceptSnapshot(currentState, candidateSnapshot) {
  const current = validateState(currentState);
  const candidate = validateState(candidateSnapshot);

  if (candidate.client_namespace !== current.client_namespace) {
    throw new IntegrityError("NAMESPACE_MISMATCH", "Snapshot belongs to another client namespace.");
  }
  if (candidate.revision < current.revision) {
    throw new IntegrityError("STALE_SNAPSHOT", "Older snapshot cannot roll state backward.");
  }
  if (candidate.revision === current.revision) {
    if (candidate.fingerprint !== current.fingerprint) {
      throw new IntegrityError("REVISION_COLLISION", "Equal revision with different fingerprint requires review.");
    }
    return current;
  }
  return candidate;
}

export function applyEvent(stateInput, event) {
  const state = validateState(stateInput);

  if (event.namespace !== state.client_namespace) {
    return { state, accepted: false, reason: "FOREIGN_NAMESPACE" };
  }
  if (state.consumed_event_ids.includes(event.event_id)) {
    return { state, accepted: false, reason: "DUPLICATE_EVENT" };
  }

  const next = structuredClone(state);
  next.base_commit_id = state.commit_id;
  next.revision = state.revision + 1;
  next.commit_id = nextCommit(state);
  next.consumed_event_ids.push(event.event_id);

  if (event.type === "safety") {
    const episodeId = event.gate_episode_id ?? `gate-${event.event_id}`;
    next.open_gates.push({
      gate_episode_id: episodeId,
      gate_type: `SAFETY_${event.safety_kind}`,
      status: "OPEN",
      affected_scope: event.affected_scope ?? [],
      source_event_id: event.event_id,
      opened_at: event.timestamp,
      resolution_requirement: event.resolution_requirement,
      closed_at: null,
      resolution_event_id: null
    });
    next.live_adds.push(episodeId);
    return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: true, reason: "SAFETY_GATE_OPENED" };
  }

  if (event.type === "resolution") {
    const gateIndex = next.open_gates.findIndex((g) => g.gate_episode_id === event.target_episode_id);
    if (gateIndex === -1) {
      next.rejected_events.push({ event_id: event.event_id, reason: "TARGET_EPISODE_NOT_OPEN" });
      return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: false, reason: "TARGET_EPISODE_NOT_OPEN" };
    }
    const gate = next.open_gates[gateIndex];
    if (event.resolution_type !== gate.resolution_requirement) {
      next.rejected_events.push({ event_id: event.event_id, reason: "RESOLUTION_TYPE_MISMATCH" });
      return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: false, reason: "RESOLUTION_TYPE_MISMATCH" };
    }
    if (gate.gate_type.startsWith("SAFETY_") && !AUTHORIZED_SAFETY_RELEASE_AUTHORITIES.has(event.source_authority)) {
      next.rejected_events.push({ event_id: event.event_id, reason: "SAFETY_RELEASE_AUTHORITY_REQUIRED" });
      return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: false, reason: "SAFETY_RELEASE_AUTHORITY_REQUIRED" };
    }

    next.open_gates.splice(gateIndex, 1);
    next.closed_gates.push({
      ...gate,
      status: "CLOSED",
      closed_at: event.timestamp,
      resolution_event_id: event.event_id
    });
    next.live_removes.push(gate.gate_episode_id);
    return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: true, reason: "TARGET_EPISODE_CLOSED" };
  }

  return { state: EngineStateSchema.parse(withFingerprint(next)), accepted: true, reason: "EVENT_RECORDED" };
}

export function commitTransition(stateInput, expectedBaseCommitId, mutator) {
  const state = validateState(stateInput);
  if (expectedBaseCommitId !== state.commit_id) {
    throw new ConcurrencyConflict(expectedBaseCommitId, state.commit_id);
  }
  const candidate = mutator(structuredClone(state));
  candidate.base_commit_id = state.commit_id;
  candidate.revision = state.revision + 1;
  candidate.commit_id = nextCommit(state);
  return EngineStateSchema.parse(withFingerprint(candidate));
}

export function compactAcknowledgedMutations(stateInput, acknowledgement) {
  return commitTransition(stateInput, acknowledgement.base_commit_id, (next) => {
    if (acknowledgement.snapshot_revision !== next.revision || acknowledgement.snapshot_fingerprint !== next.fingerprint) {
      throw new IntegrityError("ACK_MISMATCH", "Compaction acknowledgement does not match the trusted snapshot.");
    }
    const acknowledged = new Set(acknowledgement.mutation_ids ?? []);
    next.live_adds = next.live_adds.filter((id) => !acknowledged.has(id));
    next.live_removes = next.live_removes.filter((id) => !acknowledged.has(id));
    return next;
  });
}

export function restartState(stateInput) {
  const serialized = JSON.stringify(validateState(stateInput));
  return validateState(JSON.parse(serialized));
}
