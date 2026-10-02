# Hercules Hub

This repository keeps the Hercules Hub operational dashboard, experimental QA reference code, and commercial product release record together.

## What lives here

- `index.html` and `data/`: operations dashboard and versioned daily state/history.
- `commercial/CURRENT_RELEASE.json`: authoritative pointer to the latest commercial candidate and its verification limits.
- `commercial/releases/`: immutable, versioned release notes and QA evidence.
- `lab/`: experimental Decision Trace / PR-13 reference implementations. These are **QA only**, not autonomous production authority, and do not change the live client-production workflow.
- `.source_parts/`: legacy dashboard reconstruction material; retained for history and is not the live dashboard source.
- [`BRANCH_POLICY.md`](BRANCH_POLICY.md): this repository uses `main` as its only development branch.

## Current commercial status

The current candidate is **v0.11.0-fix5**. The release record and audit evidence are in `commercial/releases/v0.11.0-fix5/`. The full source and visual assets still need to be mirrored into this repository; the archive identity and checksum are recorded in `commercial/CURRENT_RELEASE.json`.

This is a web/PWA source candidate, not an Apple App Store submission package. Local checks do not verify live Netlify, Supabase, Stripe, real-device, clinical, or App Store behavior.

## Dashboard behavior

The operational dashboard reads `data/state.js`, dated snapshots under `data/history/`, and the history index. Task completion is stored in browser localStorage for that device and does not sync across devices.

See [commercial README](commercial/README.md) for release details.
