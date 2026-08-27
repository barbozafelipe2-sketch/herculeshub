import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "../src/engine.js";
import {
  acceptSnapshot,
  applyEvent,
  commitTransition,
  ConcurrencyConflict,
  createState,
  IntegrityError,
  restartState
} from "../src/state.js";
import { runCorpus } from "../src/corpus-adapter.js";

function baseInput(overrides = {}) {
  return {
    client_namespace: "client-test-001",
    intake_snapshot_id: "intake-001",
    active_plan_version_id: "plan-v1",
    source_schema_version: "intake-v2",
    event_timestamp: "2026-08-27T12:00:00Z",
    ...overrides
  };
}

function safetyEvent(overrides = {}) {
  return {
    event_id: "evt-safety-1",
    namespace: "client-test-001",
    timestamp: "2026-08-27T12:01:00Z",
    type: "safety",
    safety_kind: "PAIN",
    description: "New shoulder pain during pressing",
    affected_scope: ["TRAIN:OVERHEAD_PRESSING"],
    gate_episode_id: "gate-s1",
    resolution_requirement: "QUALIFIED_REASSESSMENT",
    ...overrides
  };
}

test("normal case maintains the approved plan", () => {
  const result = decide(baseInput());
  assert.equal(result.authority_class, "MAINTAIN");
  assert.equal(result.proposed_plan_diff, null);
});

test("missing decision-relevant feedback prompts instead of inferring success", () => {
  const result = decide(baseInput({
    decision_context: {
      requires_feedback: true,
      requested_feedback: ["session difficulty", "recovery"]
    }
  }));
  assert.equal(result.authority_class, "AUTO_PROMPT");
  assert.deepEqual(result.requested_feedback, ["session difficulty", "recovery"]);
});

test("new safety event opens an affected-scope hold", () => {
  const result = decide(baseInput({ track_events: [safetyEvent()] }));
  assert.equal(result.authority_class, "HOLD_AFFECTED_SCOPE");
  assert.deepEqual(result.affected_scope, ["TRAIN:OVERHEAD_PRESSING"]);
  assert.equal(result.active_gates[0].gate_episode_id, "gate-s1");
});

test("wrong resolution cannot clear an open episode and cannot become valid on replay", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const opened = applyEvent(base, safetyEvent()).state;
  const wrong = {
    event_id: "evt-resolution-wrong",
    namespace: "client-test-001",
    timestamp: "2026-08-27T12:02:00Z",
    type: "resolution",
    resolution_type: "USER_SAYS_BETTER",
    target_episode_id: "gate-s1",
    source_authority: "CLIENT"
  };
  const first = applyEvent(opened, wrong);
  assert.equal(first.accepted, false);
  assert.equal(first.reason, "RESOLUTION_TYPE_MISMATCH");
  assert.equal(first.state.open_gates.length, 1);
  const replay = applyEvent(first.state, wrong);
  assert.equal(replay.accepted, false);
  assert.equal(replay.reason, "DUPLICATE_EVENT");
  assert.equal(replay.state.open_gates.length, 1);
});

test("matching safety resolution from unauthorized source cannot release the gate", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const opened = applyEvent(base, safetyEvent()).state;
  const attempted = applyEvent(opened, {
    event_id: "evt-resolution-client",
    namespace: "client-test-001",
    timestamp: "2026-08-27T12:02:00Z",
    type: "resolution",
    resolution_type: "QUALIFIED_REASSESSMENT",
    target_episode_id: "gate-s1",
    source_authority: "CLIENT"
  });
  assert.equal(attempted.accepted, false);
  assert.equal(attempted.reason, "SAFETY_RELEASE_AUTHORITY_REQUIRED");
  assert.equal(attempted.state.open_gates.length, 1);
});

test("matching authorized resolution closes only its exact gate episode", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const first = applyEvent(base, safetyEvent({ event_id: "evt-safety-1", gate_episode_id: "gate-s1" })).state;
  const second = applyEvent(first, safetyEvent({ event_id: "evt-safety-2", gate_episode_id: "gate-s2", description: "New knee pain" })).state;
  const resolved = applyEvent(second, {
    event_id: "evt-resolution-1",
    namespace: "client-test-001",
    timestamp: "2026-08-27T12:03:00Z",
    type: "resolution",
    resolution_type: "QUALIFIED_REASSESSMENT",
    target_episode_id: "gate-s1",
    source_authority: "QUALIFIED_PROFESSIONAL"
  });
  assert.equal(resolved.accepted, true);
  assert.deepEqual(resolved.state.open_gates.map((g) => g.gate_episode_id), ["gate-s2"]);
  assert.equal(resolved.state.closed_gates.at(-1).gate_episode_id, "gate-s1");
});

test("restart preserves trusted open-gate and event state", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const opened = applyEvent(base, safetyEvent()).state;
  const restarted = restartState(opened);
  assert.deepEqual(restarted, opened);
});

test("older snapshot cannot roll state backward", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const current = applyEvent(base, safetyEvent()).state;
  assert.throws(() => acceptSnapshot(current, base), (err) => err instanceof IntegrityError && err.code === "STALE_SNAPSHOT");
});

test("equal revision with different content opens collision review", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const corrupted = structuredClone(base);
  corrupted.commit_id = "different-commit";
  assert.throws(() => acceptSnapshot(base, corrupted), (err) => err instanceof IntegrityError && err.code === "FINGERPRINT_MISMATCH");
});

test("stale writer is rejected instead of last-write-wins", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  assert.throws(
    () => commitTransition(base, "wrong-base", (state) => state),
    (err) => err instanceof ConcurrencyConflict && err.code === "STALE_WRITER"
  );
});

test("pre-approved substitution executes only as bounded in-plan authority", () => {
  const result = decide(baseInput({
    plan_state: {
      bounded_options: [{ option_id: "sub-1", action: "DB bench instead of machine press", affected_scope: ["TRAIN:PRESS"] }]
    },
    requested_change: {
      kind: "in_plan",
      option_id: "sub-1",
      reason: "Approved machine unavailable"
    }
  }));
  assert.equal(result.authority_class, "BOUNDED_IN_PLAN");
  assert.deepEqual(result.affected_scope, ["TRAIN:PRESS"]);
});

test("unknown substitution fails closed to human review", () => {
  const result = decide(baseInput({
    requested_change: {
      kind: "in_plan",
      option_id: "not-approved",
      reason: "Equipment unavailable"
    }
  }));
  assert.equal(result.authority_class, "PROPOSE_FOR_REVIEW");
});

test("material plan diff is proposed but never auto-activated", () => {
  const result = decide(baseInput({
    requested_change: {
      kind: "material",
      proposed_diff: { weekly_training_days: { from: 3, to: 5 } },
      reason: "Client requests more volume"
    }
  }));
  assert.equal(result.authority_class, "PROPOSE_FOR_REVIEW");
  assert.equal(result.state.active_plan_version_id, "plan-v1");
  assert.ok(result.proposed_plan_diff);
});

test("foreign namespace event cannot mutate client state", () => {
  const base = createState({ clientNamespace: "client-test-001", activePlanVersionId: "plan-v1" });
  const result = applyEvent(base, safetyEvent({ namespace: "client-other" }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "FOREIGN_NAMESPACE");
  assert.deepEqual(result.state, base);
});

test("evaluator fields are rejected from prediction input", () => {
  assert.throws(() => decide(baseInput({ expected_safety_review: true })));
});

test("corpus adapter keeps expected outcomes outside prediction input", () => {
  const corpus = runCorpus([
    {
      fixture_id: "smoke-maintain",
      input: baseInput(),
      expected: { authority_class: "MAINTAIN", active_gate_types: [] }
    },
    {
      fixture_id: "smoke-safety",
      input: baseInput({ track_events: [safetyEvent()] }),
      expected: { authority_class: "HOLD_AFFECTED_SCOPE", active_gate_types: ["SAFETY_PAIN"] }
    }
  ]);
  assert.equal(corpus.total, 2);
  assert.equal(corpus.failed, 0);
});
