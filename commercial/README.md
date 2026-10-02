# Hercules Hub — Commercial Product

## Current candidate: v0.11.0-fix5

This is the latest final-audit candidate, built from the frozen v0.10.4 rollback baseline. Release notes and audit evidence are in [releases/v0.11.0-fix5](releases/v0.11.0-fix5/).

**Status: not Apple-ready.** It is a responsive web/PWA package with no iOS/Xcode target. The 320/320 checks are local/static/pure-logic checks; they do not verify live Netlify, Supabase, Stripe, real-device, clinical, or App Store behavior.

The exact archive filename, SHA-256, byte size, rollback baseline, and mirror status are recorded in [CURRENT_RELEASE.json](CURRENT_RELEASE.json). At this commit, metadata and audit reports are in GitHub; the complete app source and image assets remain to be uploaded to this repository. Do not treat the GitHub release record as proof that those binary assets have been mirrored.

## Product boundaries

The product remains a personalized health-and-performance system. Preserve the locked product logic, privacy/safety boundaries, and supervised EVOLVE behavior in the canonical plan. Keep the operational dashboard at the repository root independent from commercial app source.
