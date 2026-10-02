# Hercules Hub — PR-13 Reference Implementation v0.1

Status: **HISTORICAL EXPERIMENT / QA REFERENCE ONLY — NOT PRODUCTION AUTHORITY**.

This is the earlier minimal reference implementation for the PR-13 TRACK → EVOLVE state and authority contract. It is preserved for traceability alongside the later, broader experimental implementation in [`lab/reference-engine`](../reference-engine/).

## Enforced invariants

- Prediction and evaluation data remain separate; prediction input uses an explicit allowlist.
- Client namespaces are isolated.
- Safety gates are episode-bound and are never cleared automatically.
- Authority is explicit; material changes remain proposals for human review.
- Missing feedback remains UNKNOWN.
- State identity, revisions, snapshots and event consumption are validated.

## Deliberate limits

This is not a medical system, does not define universal thresholds, and is not connected to real client data. It does not satisfy PR-08, PR-10, PR-11, PR-12, PR-14, or PR-15. Production persistence, authentication and authorization must remain server-side and access-controlled.

## Smoke test

Run `npm test`. The suite covers maintain, missing feedback, safety hold, qualified resolution, restart, tampered snapshot, stale writer, namespace isolation, pre-approved substitution, material proposal and evaluator leakage.

## JSON validation boundary

This sealed zero-dependency artifact uses a strict explicit validator. Before any HTTP/API wrapper is approved, replace the boundary validator with the canonical Zod schema while preserving fail-closed semantics. Do not expose secrets or sensitive client data in browser/client bundles.

## Status in this repository

This v0.1 implementation is retained as experimental history under `main`. The current working reference engine is documented separately; neither is autonomous production authority.
