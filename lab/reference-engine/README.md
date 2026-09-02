# Hercules Hub PR-13 Reference Engine v0.2

Status: **EXPERIMENTAL / QA ONLY — NOT AUTONOMOUS PRODUCTION AUTHORITY**

This directory is the executable server-side reference implementation for Hercules Decision Trace semantics. It keeps the spreadsheet laboratory as evaluation/governance authority while making the tested decision contracts versioned, reviewable and attackable in code.

## Authority boundary

The implementation returns only:

- `AUTO_LOG`
- `AUTO_PROMPT`
- `MAINTAIN`
- `BOUNDED_IN_PLAN`
- `PROPOSE_FOR_REVIEW`
- `HOLD_AFFECTED_SCOPE`

It does **not** autonomously activate material core-prescription changes or autonomously release safety holds. A bounded in-plan action must already exist in the active approved plan version.

## v0.2 additions from Synthetic War II

The temporal/state engine now represents the experimental RC-34→RC-42 frontier where applicable:

- current personalization consent / revocation precedence;
- client-learning observations with explicit evidence;
- versioned active-goal transitions;
- interruption/re-entry and shared-resource reality changes;
- age/request-scope policy gates;
- global authority → safety → lower-layer precedence;
- workout states including `PARTIAL`, `MOVED` and `UNCONFIRMED`;
- planned-versus-actual nutrition events;
- allergy conflicts opening an affected NOURISH safety gate.

`src/case-engine.js` is the source-only Intake/case adapter used for deterministic frozen-corpus replay. It refuses synthetic IDs, scenario labels, Practice Challenge, expected outcomes, reviewer fields and other evaluator metadata as prediction input.

## Frozen 2,329-case replay

The frozen Hercules corpus remains owned by the private Decision Trace Laboratory / Synthetic Intake source of truth rather than being copied into this public repository.

The v0.2 case adapter was replayed against:

- `SYN-V2-001 → SYN-V2-1330`: 1,330/1,330 high-level frozen decision classes matched;
- `SYN-V2-1331 → SYN-V2-2329`: 999/999 War II attack-family + decision-contract results matched;
- total: **2,329/2,329**, with evaluator fields kept outside prediction input.

`test/corpus-2329.test.js` contains the executable replay harness. A trusted lab-owned bundle can be supplied with `HERCULES_CASE_REPLAY_BUNDLE`; CI intentionally does not duplicate the authoritative corpus.

This case-level replay is **not** the same thing as the still-open PR-14 raw temporal/persistence replay. The historical 764 compatibility ledger is largely a result/pointer ledger and must still be resolved to its original raw event sequences before it can be honestly replayed through the state engine.

## Other represented invariants

- strict structured prediction input / decision output;
- explicit observed events only; silence/time are not evidence;
- episode-bound safety gates;
- exact episode/type resolution;
- qualified authority required for safety release;
- invalid-event idempotency;
- client namespace isolation;
- state fingerprints and monotonic snapshot checks;
- stale-writer rejection;
- immutable active plan pointer during material proposals;
- prediction/evaluation separation in the corpus adapter.

## Tests

```bash
cd lab/reference-engine
npm install --ignore-scripts
npm test
```

The normal CI suite runs the original PR-13 smoke tests, War II contract tests, and the corpus-harness integrity tests. The full private 2,329-case replay is run against the exported lab-owned bundle and recorded in Decision Trace governance artifacts rather than embedded as public test data.

## Security / privacy

This public repository contains no real client Intake V2 records, credentials or secrets. Synthetic source data also remains in the Hercules laboratory rather than being duplicated here. Any deployed service must keep client-sensitive state and privileged operations server-side and access-controlled.

## Changelog

- `v0.2` — added RC-34→RC-42 executable semantics, source-only 2,329-case adapter, War II contract tests, and full lab-owned 2,329-case replay harness/result.
- `v0.1` — created strict input/output schemas, supervised authority model, episode-bound state/persistence model, corpus adapter and smoke tests.

## Rollback

This work remains isolated on `lab/pr13-reference-engine-v0.1` / draft PR #1. Roll back by closing the PR or deleting the branch. It does not modify the live dashboard shell, client production state or canonical supervised workflow.
