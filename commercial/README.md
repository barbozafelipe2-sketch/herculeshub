# Hercules Hub — Commercial Baseline

**Current commercial starting point:** `v0.10.4`

This folder registers the current Hercules Hub commercial baseline without changing the existing operational dashboard.

## Canonical release

- Artifact: `HERCULES_HUB_GENERALIST_APPLE_PROTOTYPE_v0.10.4_ACCOUNT_FLOW_AUDITED_20260916.zip`
- SHA-256: `66772230e385ae4486bd29764665371261baf5c7e274a2539e8d7f8a52790640`
- Canonical Drive artifact: https://drive.google.com/file/d/1LsGEQ3p9rNpgDwq1ULiksEpHSjyX4QC2/view
- Canonical Source of Truth: Hercules Hub — Source of Truth & Canonical Plan v2.20

## What this baseline already contains

The approved entry flow is:

`Log In / Create Account → Stripe Checkout → verified entitlement → language → credentials → onboarding → plan generation → 3 audit gates → personalized system`

The product surface preserves:

- HOME / TRAIN / NOURISH / MIND / TRACK / EVOLVE
- Recovery through Home/post-workout flow
- Personalized training and exercise library
- Personalized nutrition, meal library, preferences, substitutions and rotation
- Baseline / Day-15 checkpoint / Day-28+ Final Mark
- Server-side AI provider orchestration and deterministic fallback
- Supabase account/state separation
- Stripe entitlement verification
- Safety HOLD and supervised EVOLVE boundaries
- Light-default / Dark-optional Hercules UI

## Verification

The canonical release records 251/251 local/static checks. On 2026-10-01 the exact Drive ZIP was re-hashed and matched the canonical SHA-256, then `npm run check` was rerun successfully:

- 143/143 core
- 46/46 cycle hardening
- 35/35 security/state
- 27/27 account flow

These are code/static/pure-logic checks, not App Store approval, deployed payment validation, clinical validation, or commercial validation.

## Status

**COMMERCIAL BASELINE — NOT FINAL STORE RELEASE.**

This is the version to improve from. Existing TRAIN, NOURISH, RECOVER, MIND, TRACK, EVOLVE, safety, cycle, navigation and theme logic should not be silently rewritten. Future commercial work should be versioned, audited, smoke-tested and reversible.

## Binary/source package

The exact 32.3 MB release ZIP remains in the canonical Hercules Drive location above. The connected GitHub transfer path could not reliably ingest that binary in one write, so this repository records the immutable release identity and canonical package location rather than pretending the binary was copied successfully.
