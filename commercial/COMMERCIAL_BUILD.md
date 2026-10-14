# Hercules Hub commercial build

**Commercial: native iOS / App Store. Test: Netlify web/PWA.**

Behavior baseline: test v0.14.1, commit `e4dc79b99796ffe47a0fcbb3bd8f08b2ad49c6eb`. [engine/UPSTREAM.json](engine/UPSTREAM.json) pins source and catalog. Archived v0.11.0-fix5 web/Stripe evidence is not the active specification.

## Identity and payment

Sign in with Apple maps to a commercial account UUID. StoreKit 2 monthly auto-renewable subscription only. No Stripe, external checkout or seven-day account trial. Set StoreKit `appAccountToken` to the account UUID.

Device identity from the beta must never authenticate the commercial app. Only Apple-verified transactions also validated by the account service grant entitlement. Expiration, refunds/revocation and account binding must be checked server-side. Backups never grant entitlement.

## Access

Generate the full month up front. Month 1 week 1 is usable. All four weeks remain readable, printable/exportable and screenshot-friendly. Other weeks are not openable/editable until active paid entitlement. Later cycles expose their authoritative current/free week and gate the remaining weeks.

Gate every actionable entry and server write: training, check-in, meal, replacement, photo, reminder and post-workout. Payment never removes safety holds. History/reports remain readable after expiration.

## Implementation boundary

`ios/` is a SwiftUI target, not a wrapper around the beta web shell. `engine/upstream/` is immutable reference source, **not commercial endpoints or executable iOS code**. Its catalog is checksum-verified and bundled as native resources.

Device auth, beta request limiter, device-owner storage adapter and beta feedback are excluded. The remaining Netlify-specific handlers require commercial account, distributed quota, AI and storage adapters before use. Do not deploy them unchanged.

`engine/src/next-month.mts` preserves deterministic eligibility, evidence and safety, and requires explicit user consent. Proposals are account-bound, reject stale/altered evidence and expire. Backend consent consumption and cycle activation must be atomic/revision-checked.

## Completion

Implement the [backend contract](BACKEND_CONTRACT.md), native onboarding, meal check/replacement/photo confirmation, explicit next-month approval UI, cycling/swimming load, permitted daily notifications and illustrated post-workout water/alignment/breathing. Configure signing, products, app icon, privacy, StoreKit sandbox and TestFlight.

No clinical diagnosis; missing meal data is not a nutrient deficiency. Synthetic QA is not clinical validation.

