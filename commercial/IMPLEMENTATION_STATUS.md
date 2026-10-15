# Commercial implementation — 0.2.0

Commercial remains native iOS / StoreKit; the separate test repository remains Netlify.

## Source implemented and connected

- Commercial Node 24 API with durable encrypted SQLite, Apple identity/session/code exchange, official Apple purchase/server-notification verification and authoritative per-account data.
- Native onboarding including swimming/cycling and safety/diet preferences.
- Full month preview, paid/free-week gates, illustrated session/meal details, session completion and explicit check-ins.
- Preference-constrained meal replacement, confirmed-photo hash trace, milestone tracking, permitted local workout reminders and post-workout water/alignment/guided breathing.
- Private signed PDF export, same-account recovery and server-authoritative existing-state preservation.
- Explicit diet/calendar approval for eligible next months, with atomic single-use proposal activation and safety overrides.
- Account deletion, Apple token revocation, purchase restoration and subscription management.

## Configuration and release work

No Apple Developer/App Store Connect credentials, registered products or commercial hosting are configured in this session. The source can be tested and built, but live identity/purchases cannot run until those are provided through secure configuration. The API container requires a durable volume and HTTPS origin; it is not the Netlify beta.

Add the approved 1024px App Store icon and published privacy/EULA URLs. Reconcile the privacy manifest and App Store privacy answers with actual retention and hosting. Native labels are currently Portuguese; plan/catalog content supports the existing Portuguese/English/Spanish selection. Complete UI localization if all three languages are included in the initial release.

AI provider calls are not configured; the conservative deterministic engine is used. Owner review is a protected durable queue, not a claim that a human has been notified/reviewed. Clinical/no-exercise/allergy restrictions cannot be cleared automatically.

## Evidence boundaries

Automated checks cover source behavior, cryptographic token checks, durable storage and simulator compilation. Real Apple authorization, StoreKit sandbox/TestFlight lifecycle, signed physical-device behavior, notification delivery, camera/library UX and App Store review require actual provisioning and device testing. Historical web reports do not verify this implementation.

