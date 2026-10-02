# Changelog — v0.11.0-fix5

## Exercise image accuracy

- Replaced `crucifixo-cabo.webp` with a standing cable chest fly demonstration.
- Replaced `puxada-neutra.webp` with a seated lat pulldown using parallel neutral-grip handles.
- Replaced `flexora-sentada.webp` with a seated hamstring curl demonstration.
- Retained the previous correction to `panturrilha-sentada.webp` (seated calf raise).
- Added SHA-256 regression checks for all four corrected exercise assets. The approved Hercules Hub logo checksum remains locked.

## Release status

- Existing server, personalization, state-hardening, UI and accessibility behavior retained from fix4.
- `npm run check` covers local automated source regressions; it does not validate live Netlify, Supabase, Stripe, iOS devices, clinical efficacy, or App Store acceptance.
- This is a web/PWA project and is not an Apple App Store submission package.
