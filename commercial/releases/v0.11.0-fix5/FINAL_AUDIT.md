# Hercules Hub Commercial — v0.11.0-fix5 Final Audit

**Status: source candidate; not Apple-ready and not verified against live production services.** The missing local logo error was a stale/missing path in the earlier run; the approved logo is present in this package and its SHA-256 is regression-locked.

## Visual review

The exercise catalog review found three additional filename-to-image mismatches and corrected them in this package:

- `crucifixo-cabo.webp`: now depicts a standing cable chest fly rather than a seated row.
- `puxada-neutra.webp`: now depicts a seated lat pulldown with parallel neutral-grip handles rather than a wide overhand bar.
- `flexora-sentada.webp`: now depicts a seated hamstring curl rather than a knee extension.
- `panturrilha-sentada.webp`: corrected in fix4 to show a seated calf raise.

Other gym and home exercise illustrations were visually skimmed and appeared consistent with their exercise labels. Food images are present; their mixed photographic/illustrated style and embedded labels remain a catalog polish issue, not a functional blocker.

## Automated verification

`npm run check` passed locally: static QA 156/156, security/state hardening 46/46, personalization/regression 99/99, and UI/accessibility 19/19. The static suite additionally verifies the SHA-256 values for all four exercise images and the approved logo. Passing source tests show that these checked invariants hold locally; they do not prove every user journey or production integration works.

## Still required before claiming full functionality

- Live deployment smoke tests with configured Netlify, Supabase, and Stripe environments.
- End-to-end checks for account creation, sign-in, subscriptions, persistence, meal/training flows, and recovery actions.
- Responsive testing in current iOS Safari and Android browsers, including real-device safe areas and offline behavior.

## Apple status

This repository is a responsive web app/PWA and has no iOS/Xcode application target. It is **not ready for Apple App Store submission**. Native packaging, Apple-specific privacy and subscription review, device QA, and App Store Connect submission are not included in this candidate.

## Catalog limitations

Strict plant-based menus still have limited variety (about 3–5 compatible entries per meal role), and bodyweight-only home training lacks a loaded pulling movement. Do not describe these catalogs as comprehensive.
