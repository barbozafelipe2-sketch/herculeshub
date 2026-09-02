import crypto from "node:crypto";
import { DecisionInputSchema, DecisionOutputSchema } from "./schema.js";
import { applyEvent, createState, validateState } from "./state.js";

const SAFETY_PREFIX = "SAFETY_";
const OUT_OF_SCOPE_REQUESTS = new Set(["DIAGNOSIS", "TREATMENT"]);

function id() {
  return `decision-${crypto.randomUUID()}`;
}

function initialState(input) {
  const state = input.state
    ? validateState(input.state)
    : createState({ clientNamespace: input.client_namespace, activePlanVersionId: input.active_plan_version_id });
  if (state.client_namespace !== input.client_namespace) throw new Error("STATE_NAMESPACE_MISMATCH");
  if (state.active_plan_version_id !== input.active_plan_version_id) throw new Error("STATE_PLAN_VERSION_MISMATCH");
  return state;
}

function deriveState(input, seedState) {
  let state = seedState;
  const eventResults = [];
  for (const event of input.track_events) {
    const result = applyEvent(state, event);
    state = result.state;
    eventResults.push({ event_id: event.event_id, accepted: result.accepted, reason: result.reason });
  }
  return { state, eventResults };
}

function openSafetyGates(state) {
  return state.open_gates.filter((g) => g.gate_type.startsWith(SAFETY_PREFIX));
}

function unionScope(gates) {
  return [...new Set(gates.flatMap((g) => g.affected_scope ?? []))];
}

function buildOutput(input, state, values) {
  return DecisionOutputSchema.parse({
    status: "OK",
    decision_id: id(),
    authority_class: values.authority_class,
    affected_scope: values.affected_scope ?? [],
    rationale: values.rationale,
    evidence_event_ids: values.evidence_event_ids ?? input.track_events.map((e) => e.event_id),
    active_gates: state.open_gates,
    requested_feedback: values.requested_feedback ?? [],
    proposed_plan_diff: values.proposed_plan_diff ?? null,
    rule_ids: values.rule_ids,
    implementation_version: input.implementation_version,
    contract_version: input.contract_version,
    state
  });
}

function confirmedLearningCandidate(state) {
  const grouped = new Map();
  for (const obs of state.learning_observations) {
    if (!obs.confirmed) continue;
    const key = `${obs.learning_key}\u0000${obs.value}`;
    const list = grouped.get(key) ?? [];
    list.push(obs);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) if (list.length >= 2) return list;
  return null;
}

function realityNeedsMaterialProposal(events) {
  return events.find((event) =>
    event.type === "reality_change" &&
    /shared|interruption|re-?entry|resume|travel ended|equipment unavailable|kitchen unavailable/i.test(event.description)
  );
}

export function decide(rawInput) {
  const input = DecisionInputSchema.parse(rawInput);
  const seedState = initialState(input);

  if (input.personalization_consent === "NO" || input.personalization_consent === "REVOKED") {
    return buildOutput(input, seedState, {
      authority_class: "HOLD_AFFECTED_SCOPE",
      affected_scope: ["PERSONALIZATION"],
      evidence_event_ids: [],
      rationale: [
        "Current personalization authority is absent or explicitly revoked.",
        "Personalized generation, adaptation, and learning stop before lower-priority optimization or event processing."
      ],
      rule_ids: ["RC-34", "RC-40", "RI-04"]
    });
  }
  if (input.personalization_consent === "UNKNOWN") {
    return buildOutput(input, seedState, {
      authority_class: "AUTO_PROMPT",
      affected_scope: ["PERSONALIZATION"],
      evidence_event_ids: [],
      requested_feedback: ["personalization consent"],
      rationale: [
        "Personalization consent is not currently authoritative.",
        "The engine requests clarification rather than inferring consent from prior activity or intake completion."
      ],
      rule_ids: ["RC-34", "RC-40", "TE2-12"]
    });
  }

  const { state, eventResults } = deriveState(input, seedState);

  const safety = openSafetyGates(state);
  if (safety.length > 0) {
    return buildOutput(input, state, {
      authority_class: "HOLD_AFFECTED_SCOPE",
      affected_scope: unionScope(safety),
      rationale: [
        "An unresolved safety-relevant gate is active.",
        "Safety gates override ordinary progression, substitutions, scope optimization, and material plan changes until a matching reviewed resolution closes the exact episode."
      ],
      rule_ids: ["TE2-05", "TE2-11", "RC-40", "RI-06", "RI-07"]
    });
  }

  if (OUT_OF_SCOPE_REQUESTS.has(input.client_context.request_type)) {
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      affected_scope: ["SCOPE:OUT_OF_PRODUCT"],
      rationale: [
        "The requested function is diagnosis or treatment, which is outside the Hercules coaching product scope.",
        "The engine does not convert an out-of-scope request into a fitness prescription."
      ],
      rule_ids: ["RC-39", "RC-40", "RI-04"]
    });
  }

  if ((input.client_context.age ?? 18) < 18 && input.client_context.request_type === "BODY_COMPOSITION" && input.client_context.minor_policy_status !== "APPROVED") {
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      affected_scope: ["SCOPE:MINOR_BODY_COMPOSITION"],
      requested_feedback: ["approved minor-age product policy / required guardian or qualified safeguards"],
      rationale: [
        "Minor-age body-composition optimization does not enter the ordinary adult autonomous pathway.",
        "A separately approved policy and required safeguards must exist before the request can progress."
      ],
      rule_ids: ["RC-39", "RC-40", "RI-04"]
    });
  }

  if (input.client_context.request_type === "AGGRESSIVE_TIMELINE") {
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      affected_scope: ["GOAL:TIMELINE"],
      rationale: [
        "The requested timeline requires reframing rather than blind execution.",
        "Outcome urgency does not override safety, recovery, scope, or evidence boundaries."
      ],
      rule_ids: ["RC-39", "RC-40", "TE2-10"]
    });
  }

  const goalChange = input.track_events.find((e) => e.type === "goal_change");
  if (goalChange) {
    if (!goalChange.confirmed) {
      return buildOutput(input, state, {
        authority_class: "AUTO_PROMPT",
        requested_feedback: ["confirm active primary goal"],
        rationale: [
          "A possible goal transition was observed but is not confirmed.",
          "The prior active goal remains in force until the new objective is explicitly confirmed."
        ],
        rule_ids: ["RC-36", "TE2-12", "TE2-15"]
      });
    }
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      proposed_plan_diff: { primary_goal: { from_plan_version: input.active_plan_version_id, to: goalChange.new_primary_goal } },
      rationale: [
        "The user explicitly confirmed a new primary goal.",
        "The old plan remains immutable history; a versioned plan transition is proposed rather than silently rewriting the active plan."
      ],
      rule_ids: ["RC-36", "TE2-10", "TE2-15", "RI-05"]
    });
  }

  const realityProposal = realityNeedsMaterialProposal(input.track_events);
  if (realityProposal) {
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      affected_scope: [realityProposal.domain],
      rationale: [
        "A verified reality change affects an assumption used by the current plan.",
        "Shared resources, re-entry, or lost access are treated as conditional reality rather than assumed availability."
      ],
      rule_ids: [/shared/i.test(realityProposal.description) ? "RC-38" : "RC-37", "TE2-08", "RC-40"]
    });
  }

  if (input.requested_change.kind === "material") {
    return buildOutput(input, state, {
      authority_class: "PROPOSE_FOR_REVIEW",
      rationale: [
        "The requested change is material to the core prescription.",
        "Material plan changes require human approval and a versioned plan transition; this implementation never auto-activates them."
      ],
      proposed_plan_diff: input.requested_change.proposed_diff,
      rule_ids: ["TE2-10", "TE2-15", "RC-40", "RI-04", "RI-05"]
    });
  }

  if (input.requested_change.kind === "in_plan") {
    const option = input.plan_state.bounded_options.find((o) => o.option_id === input.requested_change.option_id);
    if (!option) {
      return buildOutput(input, state, {
        authority_class: "PROPOSE_FOR_REVIEW",
        rationale: [
          "The requested in-plan option is not present in the active approved plan version.",
          "The implementation fails closed rather than inventing a substitute or silently expanding prescription scope."
        ],
        rule_ids: ["TE2-09", "RC-40", "RI-04", "RI-05"]
      });
    }
    return buildOutput(input, state, {
      authority_class: "BOUNDED_IN_PLAN",
      affected_scope: option.affected_scope,
      rationale: [
        "The action is a pre-approved option already contained in the active human-approved plan version.",
        "Executing it does not create a new prescription or expand scope."
      ],
      rule_ids: ["TE2-09", "RC-40", "RI-04"]
    });
  }

  if (input.decision_context.requires_feedback) {
    const explicitFeedback = input.track_events.some((e) => e.type === "feedback" || e.type === "reality_change" || e.type === "completion" || e.type === "nutrition_actual");
    if (!explicitFeedback) {
      return buildOutput(input, state, {
        authority_class: "AUTO_PROMPT",
        rationale: [
          "Decision-relevant feedback is missing.",
          "Silence and elapsed time are not interpreted as adherence, recovery, clearance, readiness, or progress."
        ],
        requested_feedback: input.decision_context.requested_feedback,
        rule_ids: ["TE2-01", "TE2-12", "TE2-13", "RC-40"]
      });
    }
  }

  const learningCandidate = confirmedLearningCandidate(state);
  if (learningCandidate) {
    return buildOutput(input, state, {
      authority_class: "AUTO_LOG",
      evidence_event_ids: learningCandidate.map((x) => x.event_id),
      rationale: [
        "Repeated confirmed observations support a durable client-learning candidate.",
        "The learning is recorded with evidence and may rank bounded future options; material prescription changes remain proposal-governed."
      ],
      rule_ids: ["RC-35", "TE2-01", "RC-40"]
    });
  }

  const acceptedEvents = eventResults.filter((r) => r.accepted);
  if (acceptedEvents.length > 0) {
    const eventTypes = input.track_events.filter((e) => acceptedEvents.some((r) => r.event_id === e.event_id)).map((e) => e.type);
    const rules = ["TE2-01", "RI-03"];
    if (eventTypes.includes("completion")) rules.push("RC-41", "TE2-02");
    if (eventTypes.includes("nutrition_actual")) rules.push("RC-42", "TE2-07");
    if (eventTypes.includes("learning_observation")) rules.push("RC-35");
    return buildOutput(input, state, {
      authority_class: "AUTO_LOG",
      rationale: [
        "Explicit client/system events were accepted and recorded.",
        "No higher-priority authority, safety, scope, or material-change condition requires a different decision."
      ],
      rule_ids: [...new Set(rules)]
    });
  }

  return buildOutput(input, state, {
    authority_class: "MAINTAIN",
    rationale: [
      "No explicit evidence justifies a prescription change.",
      "The current approved plan remains active and no conclusion is inferred from time or silence."
    ],
    rule_ids: ["TE2-01", "TE2-13", "TE2-17", "RC-40"]
  });
}
