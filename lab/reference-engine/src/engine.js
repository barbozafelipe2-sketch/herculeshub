import crypto from "node:crypto";
import { DecisionInputSchema, DecisionOutputSchema } from "./schema.js";
import { applyEvent, createState, validateState } from "./state.js";

const SAFETY_PREFIX = "SAFETY_";

function id() {
  return `decision-${crypto.randomUUID()}`;
}

function deriveState(input) {
  let state = input.state
    ? validateState(input.state)
    : createState({
        clientNamespace: input.client_namespace,
        activePlanVersionId: input.active_plan_version_id
      });

  if (state.client_namespace !== input.client_namespace) {
    throw new Error("STATE_NAMESPACE_MISMATCH");
  }
  if (state.active_plan_version_id !== input.active_plan_version_id) {
    throw new Error("STATE_PLAN_VERSION_MISMATCH");
  }

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

export function decide(rawInput) {
  const input = DecisionInputSchema.parse(rawInput);
  const { state, eventResults } = deriveState(input);

  const safety = openSafetyGates(state);
  if (safety.length > 0) {
    return buildOutput(input, state, {
      authority_class: "HOLD_AFFECTED_SCOPE",
      affected_scope: unionScope(safety),
      rationale: [
        "An unresolved safety-relevant gate is active.",
        "Safety gates override ordinary progression, substitutions, and material plan changes until a matching reviewed resolution closes the exact episode."
      ],
      rule_ids: ["TE2-05", "TE2-11", "RI-06", "RI-07"]
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
      rule_ids: ["TE2-10", "TE2-15", "RI-04", "RI-05"]
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
        rule_ids: ["TE2-09", "RI-04", "RI-05"]
      });
    }
    return buildOutput(input, state, {
      authority_class: "BOUNDED_IN_PLAN",
      affected_scope: option.affected_scope,
      rationale: [
        "The action is a pre-approved option already contained in the active human-approved plan version.",
        "Executing it does not create a new prescription or expand scope."
      ],
      rule_ids: ["TE2-09", "RI-04"]
    });
  }

  if (input.decision_context.requires_feedback) {
    const explicitFeedback = input.track_events.some((e) => e.type === "feedback" || e.type === "reality_change");
    if (!explicitFeedback) {
      return buildOutput(input, state, {
        authority_class: "AUTO_PROMPT",
        rationale: [
          "Decision-relevant feedback is missing.",
          "Silence and elapsed time are not interpreted as adherence, recovery, clearance, readiness, or progress."
        ],
        requested_feedback: input.decision_context.requested_feedback,
        rule_ids: ["TE2-01", "TE2-12", "TE2-13"]
      });
    }
  }

  const acceptedEvents = eventResults.filter((r) => r.accepted);
  if (acceptedEvents.length > 0) {
    return buildOutput(input, state, {
      authority_class: "AUTO_LOG",
      rationale: [
        "Explicit client/system events were accepted and recorded.",
        "No active safety gate or authorized material/in-plan change requires a different authority in this decision."
      ],
      rule_ids: ["TE2-01", "TE2-02", "RI-03"]
    });
  }

  return buildOutput(input, state, {
    authority_class: "MAINTAIN",
    rationale: [
      "No explicit evidence justifies a prescription change.",
      "The current approved plan remains active and no conclusion is inferred from time or silence."
    ],
    rule_ids: ["TE2-01", "TE2-13", "TE2-17"]
  });
}
