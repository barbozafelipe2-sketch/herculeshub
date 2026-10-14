import {
  applyDelta, buildSignals, daysSince, dedupeDailyCheckins, deterministicDelta,
  milestoneTimeValid, validateDelta, week4Complete
} from "../upstream/netlify/functions/cycle-lib.mts";
import { digest } from "../upstream/netlify/functions/trace-lib.mts";

// The caller supplies validated SERVER records. Never pass a request/backup as authoritative state.
export async function proposeNextMonth(accountID: string, profile: any, plan: any, state: any, now = Date.now()) {
  if (!accountID || daysSince(state.startedAt, now) < 28 ||
      !week4Complete(state, plan.training.pattern) ||
      !milestoneTimeValid("finalMark", state.startedAt, state.finalMark, now)) {
    throw new Error("next_month_not_eligible");
  }
  const effective = {
    ...structuredClone(state), checkins: dedupeDailyCheckins(state.checkins || []),
    baseline: milestoneTimeValid("baseline", state.startedAt, state.baseline, now) ? state.baseline : null,
    checkpoint: milestoneTimeValid("checkpoint", state.startedAt, state.checkpoint, now) ? state.checkpoint : null
  };
  const signals = buildSignals(effective, plan, {}, daysSince(state.startedAt, now));
  const delta = deterministicDelta(signals, plan);
  const validation = validateDelta(delta, signals, plan);
  if (!validation.ok) throw new Error("invalid_delta");
  const nextPlan = applyDelta(plan, delta, profile, effective);
  nextPlan.createdAt = new Date(now).toISOString();
  // Commercial consent is required even if the beta's deterministic fallback would auto-approve.
  nextPlan.evolve = {...nextPlan.evolve, materialChangesAutomatic: false, safetyReleaseAutomatic: false};
  return {
    accountID, cycleNumber: Number(state.cycleNumber || 1) + 1,
    proposedAt: new Date(now).toISOString(),
    inputDigest: await digest({accountID, profile, plan, state}),
    outputDigest: await digest(nextPlan), delta, nextPlan,
    userApprovalRequired: true,
    requiresReview: !!(plan.trainingHold || signals.symptomFlag || plan.reviewRouting?.ownerReviewRequired)
  };
}

export async function approveNextMonth(
  proposal: Awaited<ReturnType<typeof proposeNextMonth>>,
  authoritative: {accountID: string; profile: any; plan: any; state: any},
  consumeApproval: (accountID: string, inputDigest: string, outputDigest: string) => Promise<boolean>,
  now = Date.now()
) {
  if (proposal.accountID !== authoritative.accountID) throw new Error("account_mismatch");
  const inputDigest = await digest(authoritative);
  if (inputDigest !== proposal.inputDigest) throw new Error("proposal_stale");
  const proposedAt = Date.parse(proposal.proposedAt);
  if (!Number.isFinite(proposedAt) || proposedAt > now || now - proposedAt > 24 * 60 * 60 * 1000) {
    throw new Error("proposal_expired");
  }
  // Rebuild from authoritative records; no fields in a caller-supplied proposal confer authority.
  const expected = await proposeNextMonth(authoritative.accountID, authoritative.profile,
    authoritative.plan, authoritative.state, proposedAt);
  if (expected.outputDigest !== proposal.outputDigest ||
      await digest(proposal.nextPlan) !== expected.outputDigest) throw new Error("proposal_tampered");
  if (expected.requiresReview) throw new Error("owner_review_required");
  // Backend adapter must atomically consume a one-use consent bound to account and both digests,
  // and commit the cycle under a compare-and-swap on the previous cycle/state revision.
  if (!await consumeApproval(authoritative.accountID, inputDigest, expected.outputDigest)) {
    throw new Error("explicit_user_approval_required");
  }
  return expected.nextPlan;
}

