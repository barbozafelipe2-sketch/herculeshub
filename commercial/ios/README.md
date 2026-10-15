# Native iOS build

Requirements: Mac with Xcode/iOS 17+ SDK, Node 22.18+ and XcodeGen. From `commercial/ios`:

```sh
node ../engine/scripts/verify-upstream.mjs
node ../engine/scripts/prepare-native-assets.mjs
swift test --package-path HerculesCore
xcodegen generate --spec project.yml
xcodebuild -project HerculesHub.xcodeproj -scheme HerculesHub -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Generated project, entitlement file and catalog resources are ignored. Open the generated project for signing/device runs. Register the actual bundle ID and enable Sign in with Apple.

| Xcode setting | Value |
| --- | --- |
| `HERCULES_API_BASE_URL` | Commercial HTTPS API implementing [../BACKEND_CONTRACT.md](../BACKEND_CONTRACT.md) |
| `HERCULES_MONTHLY_PRODUCT_ID` | Actual monthly auto-renewable App Store Connect product |
| `HERCULES_PRIVACY_URL` | Published HTTPS privacy policy |
| `HERCULES_TERMS_URL` | Published HTTPS terms/EULA |
| `PRODUCT_BUNDLE_IDENTIFIER` | Registered identifier |
| `DEVELOPMENT_TEAM` | Apple developer team |

Default identifiers are placeholders, not provisioned Apple products. Missing backend disables sign-in; incomplete purchase/legal settings prevent purchases. No provider/database secret belongs in build settings.

Tokens remain in memory. Paid unlock requires an Apple-verified transaction and server validation. Deletion requires server confirmation and Apple credential revocation; subscription cancellation is separate and available through Apple's management UI.

The backend and onboarding, meal/photo/reminder/post-workout and approval screens are implemented; configure and deploy the commercial API described in ../backend/README.md. Add an approved 1024px App Store icon. Reconcile the initial privacy manifest with actual backend retention/collection and SDKs before submission.

CI runs Swift access-policy tests and an unsigned simulator build. Physical-device/TestFlight QA must cover purchase cancellation/pending/unverified results, renewal/expiry/refund, restore across devices/accounts, locked-week deep links/writes, deletion, exports and safety holds.



## Sem conta Apple ainda

A preparação de release está em [../release/README.pt-BR.md](../release/README.pt-BR.md). Debug funciona sem assinatura; Sandbox e Production possuem configurações locais separadas. O script de archive só será usado quando houver conta/produtos/chaves e hospedagem configurados. Não envia automaticamente à Apple.
