# Hercules Hub

| Channel | Repository | Runtime | Identity | Payment |
| --- | --- | --- | --- | --- |
| Commercial | this repository, `commercial/ios` | native iOS / App Store | commercial account / Sign in with Apple | StoreKit 2 |
| Family/friends test | [hercules-hub](https://github.com/barbozafelipe2-sketch/hercules-hub) | Netlify web/PWA | beta device session | free |

The operational dashboard (`index.html`, `data/`) remains independent of the commercial app.

The commercial directory now contains a SwiftUI target, StoreKit client, account API client, week access policy, explicit-consent cycle adapter and versioned upstream engine/assets. This is a native implementation foundation, **not an App Store release**. The commercial backend and end-to-end native workflows are outstanding.

See [commercial status](commercial/README.md), [iOS build](commercial/ios/README.md), [backend contract](commercial/BACKEND_CONTRACT.md) and [engine mirror](commercial/engine/README.md).

The archived `commercial/releases/v0.11.0-fix5/` web/Stripe documents are historical evidence, not the active native specification. Their QA results do not validate the native app.

`lab/` remains experimental QA; `.source_parts/` contains legacy dashboard reconstruction material. [BRANCH_POLICY.md](BRANCH_POLICY.md) keeps approved work on `main`.

