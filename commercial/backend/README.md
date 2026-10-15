# Commercial account API

Independent Node 24 service for the App Store client. It does not use Netlify sessions, endpoints, quotas or storage.

## Implemented

- Apple identity JWT signature/audience/issuer/expiry/nonce checks, single-use challenges and authorization-code exchange.
- Revocable expiring bearer sessions; stable account UUIDs used as StoreKit appAccountToken.
- Official Apple App Store Server Library 3.1.0 with online certificate checks, current transaction/status queries and V2 notifications.
- Product/environment/account binding, durable ownership, idempotent notifications and refund/revocation handling.
- SQLite WAL transactions, encrypted profile/state/refresh tokens (AES-256-GCM), hashed sessions and persistent quotas.
- Authoritative onboarding/month/week/session/check-in/meal/photo/milestone/post-workout APIs.
- Account-bound signed recovery PDFs, explicit next-cycle approval with optimistic concurrency, account deletion after Apple token revocation.
- Authenticated owner review queue. Only allowlisted reviewer account UUIDs can acknowledge ordinary reviews; this cannot clear training safety holds/allergy restrictions.

The initial plan and full month catalog are materialized from pure declarations extracted from the frozen beta source; no browser or device-identity code is executed. AI/provider integration is not required for this deterministic engine. No AI photo/nutrient diagnosis is performed.

## Run

```sh
npm install --prefix commercial/backend --ignore-scripts
node --env-file=/secure/location/commercial.env commercial/backend/src/server.mjs
```

Configure all values from [.env.example](.env.example) in your service's secret manager. Download Apple PKI DER roots from Apple's official certificate authority page and mount them read-only. Mount separate Sign in with Apple and App Store Server API keys with permissions readable by the service only. No credentials are accepted through a client request.

The service refuses to start with missing Apple/database/encryption configuration. Use Sandbox for development/TestFlight and Production for the App Store release, with independent backend configuration/database and native API URLs. Sandbox purchases cannot unlock the production service.

## Deployment

Build from the repository root with `docker build -f commercial/backend/Dockerfile -t hercules-commercial .`. Run on a stateful container host with HTTPS ingress and a durable private `/data` volume. Configure Apple Server Notifications V2 to POST `/apple/notifications` on the matching environment's HTTPS origin.

This SQLite deployment supports a single service/volume, including local workers serialized through WAL transactions. Do not deploy this database to ephemeral/serverless filesystems or scale replicas with independent volumes. Back up the encrypted database and encryption key separately and test recovery. Mounting a new volume or changing the encryption key loses access to the old state. No infrastructure or Apple product is provisioned by this repository.

Check `GET /health`, then exercise real Sign in with Apple, sandbox purchase/renewal/refund, restore and deletion on signed iOS builds before release. App icon/legal URLs/App Store Connect provisioning still belong to the release configuration.

## Privacy and recovery

Progress, Apple refresh tokens and purchase payloads are encrypted at rest. Photos are resized in the app; only their SHA-256 and explicit user confirmation are retained, not image bytes. Reports are private and contain no credentials/entitlement.

A PDF's recovery payload is signed by the service and bound to the same verified account. Existing authoritative state wins on restore, so importing an old report cannot rewind a cycle or clear a new safety restriction. Empty state can be recovered from a valid same-account export.

Deletion first blocks ordinary account access, then revokes the Apple token; it removes account state/sessions only after Apple confirms. Failure leaves a retryable deletion state. Minimal keyed purchase ownership and purchase records are retained for purchase verification/reassignment protection; disclose this retention in the privacy policy. Deletion does not cancel the Apple subscription.

No clinical safety-clearance endpoint exists. A qualified resolution workflow must be defined before removing professional/no-exercise restrictions; payment and ordinary reviewer acknowledgement never clear them.

## Verification

```sh
node --test commercial/backend/test/*.test.mjs
```

Tests execute the real HTTP handlers with Node streams and durable SQLite, plus local cryptographic JWT verification and an injected Apple Server API adapter. They cover protected writes, isolation, refunds, signed reports, deletion retries, database restart and atomic cycle consent. Apple network calls in workflow tests are simulated; real Apple sandbox/device verification remains required.

