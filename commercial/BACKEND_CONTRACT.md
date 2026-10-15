# Commercial HTTPS account API

**Status: implemented in `backend/`; live deployment/Apple provisioning outstanding.** Use a separate commercial account/data namespace. Never point the native client at the Netlify beta.

All endpoints use HTTPS, no cross-origin redirects, bounded requests and no-store responses. Protected endpoints require a verified, revocable `Authorization: Bearer <commercial-access-token>`. Resolve identity from the session, never a device ID/client-supplied account. Use distributed atomic quotas; storage failure cannot bypass cost caps. Dates are ISO-8601 UTC without fractional seconds; account IDs are UUIDs.

| Method/path | Input | Output |
| --- | --- | --- |
| POST `auth/apple/challenge` | none | `{challengeID, nonceSHA256}` |
| POST `auth/apple/session` | `{challengeID, identityToken, authorizationCode}` | `{accountID, accessToken}` |
| GET `account/entitlement` | authenticated | `{entitlement: null or {accountID,productID,expiresAt,revoked}}` |
| POST `account/storekit` | `{signedTransaction}` | same entitlement response |
| GET `account/month` | authenticated | `{id,cycleNumber,freeWeek,trainingHold,weeks:[{number,title,summary}]}` |
| GET `account/weeks/:week` | authenticated + week authorized | `{training:[string],meals:[string]}` |
| POST `account/checkins` | `{week,energy:1..5,sleep:1..5}` | `{ok:true}` |
| GET `account/report` | authenticated; payment not required | `application/pdf` |
| DELETE `account` | authenticated, recent session | `{ok:true}` only after completion |

## Authentication

Generate a random nonce and short-lived single-use challenge; consume atomically. Validate Apple's JWT signature/current keys, issuer, bundle audience, expiry and nonce. Exchange the authorization code server-side. Map the verified Apple subject to a stable account UUID, independently of email/private relay. Sessions expire and are revocable. Reauthenticate destructive operations; account deletion revokes Apple tokens and commercial sessions.

## Purchases

Validate JWS using Apple's supported server library/API and certificate chain. Check bundle ID, production Apple app ID, environment, allowlisted product/subscription type, expiration/revocation and `appAccountToken == authenticated account UUID`. One transaction cannot be reassigned across accounts. Deduplicate deliveries, durably persist verification and process App Store Server Notifications V2 for renewal/refund/revocation.

Return null for expired/revoked purchases. Never grant access from a client flag, receipt hash, backup or unsigned decoded JWS. Retry delivery safely; acknowledge only after durable verification.

## Plans, access and deletion

Generate/persist the complete month from validated onboarding and beta engine/catalog/safety rules. The native month projection is a summary, not the canonical plan. Return four weeks and authoritative free-week/safety metadata. Every protected read/write rechecks account, cycle, free-week/entitlement and safety; client gates are only UI affordances. Never accept client replacement of canonical safety/review state.

Next-month proposals use validated server evidence and the commercial consent adapter. Consume account-bound input/output-digest consent and activate atomically under a revision check. User consent is not clinical clearance; AI cannot exceed deterministic safety limits.

Restores are account-authorized schema-validated migrations and cannot restore entitlements, credentials, safety clearance or consumed consent. Reports are private/readable regardless of payment. Deletion removes account-owned state/reports/reviews subject to disclosed retention, revokes sessions/Apple tokens and confirms only after completion. Deletion does not cancel the Apple subscription.

The implemented Node service uses encrypted SQLite and persistent transactional quotas on a durable private volume; it does not expose a database Data API. Configure its Apple credentials, HTTPS origin and notification route before setting the native API URL. Upstream Netlify handlers must not be deployed unchanged.



Additional implemented routes: POST account/onboarding; POST account/sessions; POST account/milestones; POST account/meals (check/replace/photo); POST account/post-workout; POST account/logout; POST account/restore; POST account/next-month/propose; POST account/next-month/approve. GET account/weeks/:week also returns structured sessions/days and server completion state. POST apple/notifications handles verified V2 events. GET/POST admin/reviews routes require an allowlisted reviewer account and cannot clear clinical/allergy holds.

### AI Coach

- `GET /account/coach`: `{available, providers, consented, messages}`; sessão obrigatória.
- `POST /account/coach/consent`: `{accepted: boolean}`; autoriza os provedores atuais ou revoga e apaga a conversa.
- `POST /account/coach`: `{question: string(1...2000), requestID: UUID}`; contexto do cliente é rejeitado. Retorna `{message:{id,role,text,at}, provider, authoritativeState:true}`. Requer onboarding e consentimento; contexto é montado pelo servidor com as semanas autorizadas.
- `DELETE /account/coach`: apaga conversa e resposta idempotente, preservando cotas e autorização.
- Erros: `401` sessão; `403` consentimento; `409` conversa em andamento/contexto alterado; `429` cota; `503` IA indisponível. A conversa não altera prescrição, assinatura ou bloqueios.
