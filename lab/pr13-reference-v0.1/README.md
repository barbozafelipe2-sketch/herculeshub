# Hercules Hub — PR-13 Reference Implementation v0.1

Status: **EXPERIMENTAL / QA REFERENCE ONLY — NOT AUTONOMOUS PRODUCTION AUTHORITY**.

This isolated reference service implements the PR-13 TRACK → EVOLVE state/authority contract without changing the live Hercules dashboard or client-production workflow.

## Enforced invariants
- prediction/evaluation separation and strict prediction allowlist
- namespace isolation
- episode-bound safety gates
- no automatic safety release
- explicit authority enum
- material changes remain human-review proposals
- UNKNOWN/missing-feedback behavior
- commit/revision state identity and CAS stale-writer rejection
- snapshot fingerprint integrity
- idempotent event consumption
- restart from verified state

## Deliberate limits
This is not a medical system, defines no universal thresholds, is not connected to real client data, and does not satisfy PR-08, PR-10, PR-11, PR-12, PR-14, or PR-15. Production persistence/authentication/authorization must remain server-side and access-controlled.

## Smoke test
Run `npm test`. The suite covers maintain, missing feedback, safety hold, wrong/qualified resolution, restart, tampered snapshot, stale writer, namespace isolation, pre-approved substitution, material proposal and evaluator leakage.

## JSON validation hardening
This sealed zero-dependency artifact uses a strict explicit validator. Before any HTTP/API wrapper is approved, replace the boundary validator with the canonical Zod schema while preserving fail-closed semantics. Do not expose secrets or sensitive client data in browser/client bundles.
