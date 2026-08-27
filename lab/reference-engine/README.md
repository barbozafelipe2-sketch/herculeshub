# Hercules Hub PR-13 Reference Engine v0.1

Status: **EXPERIMENTAL / QA ONLY — NOT AUTONOMOUS PRODUCTION AUTHORITY**

This directory is the first concrete server-side reference implementation for the candidate TRACK → EVOLVE contract. It exists to make the spreadsheet-tested semantics executable, versioned, reviewable and attackable without turning the Decision Trace Laboratory into production architecture.

## Authority boundary

The implementation can return only:

- `AUTO_LOG`
- `AUTO_PROMPT`
- `MAINTAIN`
- `BOUNDED_IN_PLAN`
- `PROPOSE_FOR_REVIEW`
- `HOLD_AFFECTED_SCOPE`

It **cannot** autonomously activate material core-prescription changes or release safety holds. A bounded in-plan action must already exist in the active human-approved plan version.

## Contract invariants represented

- Prediction/evaluation separation with strict JSON validation.
- Explicit observed events only; silence/time are not evidence.
- Episode-bound safety gates.
- Same-type episode coexistence.
- Resolution type + exact episode matching.
- Invalid resolution events are consumed so they cannot become valid later by replay.
- Client namespace isolation.
- Monotonic trusted snapshots and fingerprint verification.
- Stale-writer rejection instead of last-write-wins.
- Immutable active plan pointer during material proposals.
- Frozen-corpus adapter keeps expected outcomes outside prediction input.

## Smoke test

```bash
cd lab/reference-engine
npm install --ignore-scripts
npm test
```

The smoke suite covers the minimum PR-13 contract cases: maintain, missing feedback, new safety gate, wrong resolution, exact episode release, restart durability, stale snapshot, writer conflict, bounded substitution, unknown substitution, material proposal, namespace isolation, evaluator leakage and prediction/evaluation separation.

## Frozen corpus

`src/corpus-adapter.js` is the production-implementation adapter. The existing spreadsheet corpus remains the frozen evaluation authority until it is exported without changing its conceptual fixtures. **Do not modify expected fixtures to make this implementation pass.** A full unchanged-corpus replay is required before PR-14 can pass.

## Security / privacy

This public repository contains no real client Intake V2 data, credentials or secrets. A future deployed service must keep client-sensitive state and privileged operations server-side and access-controlled.

## Changelog

- `v0.1` — created strict input/output schemas, supervised authority model, episode-bound state/persistence model, corpus adapter and smoke tests.

## Rollback

This work is isolated on the `lab/pr13-reference-engine-v0.1` branch. Roll back by closing the PR or deleting the branch. It does not modify the live dashboard shell, `data/state.js`, history files or canonical client-production workflow.
