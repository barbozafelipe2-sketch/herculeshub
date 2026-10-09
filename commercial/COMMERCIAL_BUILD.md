# Hercules Hub commercial build

Source of product behavior: `barbozafelipe2-sketch/hercules-hub` v0.14.1, commit `1735abb89a44795b024559a6e720431077be3b98`.

This repository is the commercial line. The Netlify beta stays device-first and free for family testing. Do not port its device-id session into this app.

## Payment

StoreKit only. No Stripe. No web subscription. No external checkout.

Apple's commission applies to the in-app purchase. An outside link is not part of this product.

## Access

The month is generated up front. Week 1 is usable. Weeks 2, 3, and 4 stay on screen, readable enough to look at and print, and impossible to open.

Before payment:

- week 1 training, meal check, replacement text, photo confirmation, reminder, and post-workout menu work
- later weeks render locked: visible, not tappable, not editable
- print and screenshot of the locked month are allowed
- check-ins and meal writes do not open on a locked week

After payment:

- the whole current month opens
- later months follow the same rule: current week usable, rest visible and locked, until the entitlement covers them
- history and the monthly report stay readable

There is no free-floating seven-day account trial and no outside renewal.

## Engine mirror

Copy into `commercial/engine` from the beta, without rewriting behavior:

- generate, next-cycle, cycle-lib, catalog-lib
- safety-lib, review-lib, coach, schemas
- trace-lib, restore, ai-lib, usage-lib, state, status
- the versioned catalog and asset prepare step

Do not copy:

- auth.mts, auth-lib.mts
- request-lib.mts in-memory rate limit as the commercial limiter
- supabase-lib.mts device owner key
- public/app.js as the store shell

Commercial identity is an account. Entitlement is a verified StoreKit purchase. Safety holds still outrank adaptation.

## After the engine

1. Account, StoreKit entitlement, export, and deletion.
2. Meal check, replacement, and confirmed photo trace.
3. Monthly report for the person, not only for the next training cycle.
4. Next plan only after the person approves the proposed diet and calendar changes.
5. Cycling and swimming load in onboarding and check-in.
6. Daily notification for that day's session.
7. Post-workout menu with images: water, alignment, short guided breathing.
8. Native iOS shell, privacy manifest, account deletion, TestFlight.

No clinical diagnosis. Missing meal data is missing data, not a nutrient deficiency.
