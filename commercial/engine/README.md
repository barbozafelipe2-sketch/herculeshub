# Commercial engine boundary

`UPSTREAM.json` pins test v0.14.1 and its asset bundle to immutable Git blob hashes. The beta repository is unchanged.

```sh
node commercial/engine/scripts/verify-upstream.mjs
npm --prefix commercial/engine run check
node commercial/engine/scripts/prepare-native-assets.mjs
```

Node 22.18+ provides TypeScript stripping. The executable adapter needs no external dependencies and imports only pure cycle/trace modules.

`upstream/` preserves original generation/catalog/schema/AI/coach/review/restore/state/usage code for the backend port. It is reference material, not a working commercial server. Netlify-specific modules require account-scoped commercial adapters; excluded device-auth/request/storage files prevent accidental beta authentication reuse.

`src/next-month.mts` stages proposals from validated server records, enforcing account binding, unchanged evidence/output, expiration, explicit one-use consent and safety/owner review. The backend must atomically consume consent AND activate with a state-revision check.

The archive is reconstructed and every manifest asset individually verified before copying into native resources. AI/server code stays off device. Checksums provide integrity/provenance, not authorization.



The commercial backend now executes `src/materialize.mjs`, containing pure unchanged training/menu declarations extracted from the frozen beta `public/app.js`. This is server logic, not a web shell; no DOM/device/network declarations were included. `MATERIALIZER_SOURCE.json` records provenance. The independent account/Apple/persistence adapters are in `../backend`; the upstream cloud handlers remain reference-only.
