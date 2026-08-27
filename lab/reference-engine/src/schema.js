import { z } from "zod";

export const AuthorityClass = z.enum([
  "AUTO_LOG",
  "AUTO_PROMPT",
  "MAINTAIN",
  "BOUNDED_IN_PLAN",
  "PROPOSE_FOR_REVIEW",
  "HOLD_AFFECTED_SCOPE"
]);

export const GateEpisodeSchema = z.object({
  gate_episode_id: z.string().min(1),
  gate_type: z.string().min(1),
  status: z.enum(["OPEN", "CLOSED"]),
  affected_scope: z.array(z.string()).default([]),
  source_event_id: z.string().min(1),
  opened_at: z.string().min(1),
  resolution_requirement: z.string().min(1),
  closed_at: z.string().nullable().optional(),
  resolution_event_id: z.string().nullable().optional()
}).strict();

export const BoundedOptionSchema = z.object({
  option_id: z.string().min(1),
  action: z.string().min(1),
  affected_scope: z.array(z.string()).default([])
}).strict();

const BaseEvent = {
  event_id: z.string().min(1),
  namespace: z.string().min(1),
  timestamp: z.string().min(1)
};

export const TrackEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...BaseEvent,
    type: z.literal("completion"),
    action_id: z.string().min(1),
    outcome: z.enum(["COMPLETED", "SKIPPED", "RESCHEDULED"])
  }).strict(),
  z.object({
    ...BaseEvent,
    type: z.literal("feedback"),
    domain: z.enum(["TRAIN", "NOURISH", "RECOVER", "MIND", "TRACK"]),
    signal: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
    scale_version: z.string().nullable().optional()
  }).strict(),
  z.object({
    ...BaseEvent,
    type: z.literal("reality_change"),
    domain: z.enum(["SCHEDULE", "EQUIPMENT", "TRAVEL", "WORKLOAD", "SPORT", "NUTRITION"]),
    description: z.string().min(1)
  }).strict(),
  z.object({
    ...BaseEvent,
    type: z.literal("safety"),
    safety_kind: z.enum(["PAIN", "CONCERNING_SYMPTOM", "PROFESSIONAL_RESTRICTION", "OTHER_SAFETY"]),
    description: z.string().min(1),
    affected_scope: z.array(z.string()).default([]),
    gate_episode_id: z.string().min(1).optional(),
    resolution_requirement: z.string().min(1).default("REVIEWED_MATCHING_RESOLUTION")
  }).strict(),
  z.object({
    ...BaseEvent,
    type: z.literal("resolution"),
    resolution_type: z.string().min(1),
    target_episode_id: z.string().min(1),
    source_authority: z.string().min(1)
  }).strict()
]);

export const EngineStateSchema = z.object({
  client_namespace: z.string().min(1),
  active_plan_version_id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  commit_id: z.string().min(1),
  base_commit_id: z.string().nullable(),
  open_gates: z.array(GateEpisodeSchema),
  closed_gates: z.array(GateEpisodeSchema),
  consumed_event_ids: z.array(z.string()),
  rejected_events: z.array(z.object({
    event_id: z.string(),
    reason: z.string()
  }).strict()),
  live_adds: z.array(z.string()),
  live_removes: z.array(z.string()),
  fingerprint: z.string().min(1)
}).strict();

export const DecisionInputSchema = z.object({
  client_namespace: z.string().min(1),
  intake_snapshot_id: z.string().min(1),
  active_plan_version_id: z.string().min(1),
  source_schema_version: z.string().min(1),
  contract_version: z.string().min(1).default("TRACK-EVOLVE-v0.2-candidate"),
  implementation_version: z.string().min(1).default("PR13-reference-v0.1"),
  event_timestamp: z.string().min(1),
  state: EngineStateSchema.optional(),
  track_events: z.array(TrackEventSchema).default([]),
  plan_state: z.object({
    bounded_options: z.array(BoundedOptionSchema).default([])
  }).strict().default({ bounded_options: [] }),
  decision_context: z.object({
    requires_feedback: z.boolean().default(false),
    requested_feedback: z.array(z.string()).default([])
  }).strict().default({ requires_feedback: false, requested_feedback: [] }),
  requested_change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }).strict(),
    z.object({
      kind: z.literal("in_plan"),
      option_id: z.string().min(1),
      reason: z.string().min(1)
    }).strict(),
    z.object({
      kind: z.literal("material"),
      proposed_diff: z.record(z.string(), z.unknown()),
      reason: z.string().min(1)
    }).strict()
  ]).default({ kind: "none" })
}).strict();

export const DecisionOutputSchema = z.object({
  status: z.literal("OK"),
  decision_id: z.string().min(1),
  authority_class: AuthorityClass,
  affected_scope: z.array(z.string()),
  rationale: z.array(z.string()).min(1),
  evidence_event_ids: z.array(z.string()),
  active_gates: z.array(GateEpisodeSchema),
  requested_feedback: z.array(z.string()),
  proposed_plan_diff: z.record(z.string(), z.unknown()).nullable(),
  rule_ids: z.array(z.string()).min(1),
  implementation_version: z.string().min(1),
  contract_version: z.string().min(1),
  state: EngineStateSchema
}).strict();
