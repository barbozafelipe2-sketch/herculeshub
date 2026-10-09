# Hercules Hub commercial build

Source of product behavior: `barbozafelipe2-sketch/hercules-hub` v0.14.1, commit `1735abb89a44795b024559a6e720431077be3b98`.

This repository is the commercial line. The Netlify beta stays device-first and free for family testing. Do not port its device-id session into this app.

## Trial

Seven days of the real product, then the account locks until payment.

Included during the trial:

- account creation
- onboarding
- month-1 plan generation
- training check-ins
- meal check, replacement text, and photo confirmation
- daily workout reminder, if the person allows notifications
- post-workout menu

Not included:

- a paywall on week 2, 3, or 4 inside an already generated month
- charging before the person has seen a plan

After day 7 without an active entitlement:

- history, the current plan, and the monthly report stay readable
- new plan generation, next-cycle adaptation, and new meal or training writes stop
- restore of a paid export still requires the same account

Week-by-week unlock is rejected. The product promise is a monthly adaptive plan. Hiding later weeks makes the plan look like a drip, and it fights the report, which needs the whole month.

Payment is StoreKit on the iOS app. A web Stripe checkout may exist for subscribers who pay outside the app. Both must set the same server entitlement. A Stripe screen inside the app is not the commercial path.

The United States external-link fee is unsettled. Do not design the price around a permanent zero Apple commission.

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

Commercial identity is an account. Entitlement is verified paid or active trial. Safety holds still outrank adaptation.

## After the engine

1. Account, entitlement, export, and deletion.
2. Meal check, replacement, and confirmed photo trace.
3. Monthly report for the person, not only for the next training cycle.
4. Next plan only after the person approves the proposed diet and calendar changes.
5. Cycling and swimming load in onboarding and check-in.
6. Daily notification for that day's session.
7. Post-workout menu with images: water, alignment, short guided breathing.
8. Native iOS shell, privacy manifest, account deletion, TestFlight.

No clinical diagnosis. Missing meal data is missing data, not a nutrient deficiency.
