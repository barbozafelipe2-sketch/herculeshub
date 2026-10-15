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

## Mensagens diárias locais

Em **Sua rotina → Mensagens diárias**, cada conta pode ativar manhã/noite, escolher os horários e autorizar notificações. Tudo fica desativado por padrão. Detalhes do treino na tela bloqueada exigem uma escolha separada; nenhum dado de saúde ou nome é incluído. Mensagens variam entre treino previsto, descanso, treino já registrado e incentivo geral, sem IA/provedor externo.

O app consulta as semanas autorizadas e agenda até 28 mensagens (14 dias), limitadas ao ciclo atual. Semana bloqueada, assinatura expirada ou calendário incompleto nunca viram convite específico para treinar. Restrições de segurança substituem o incentivo de treino por recuperação. O agendamento é reconstruído ao atualizar o plano, registrar treino/check-in ou salvar preferências; sair, excluir conta ou falhar a verificação cancela as mensagens diárias. Preferências são locais e separadas por conta; exclusão remove as preferências.

Não é push de servidor: depois de 14 dias ou do fim do ciclo, é necessário abrir o app para renovar. Mudanças de fuso e alterações feitas em outro aparelho só são refletidas após atualizar este aparelho. Foco, permissões e ajustes do iPhone podem adiar ou silenciar a entrega. Tocar abre a semana quando a conta, o mês e o acesso ainda correspondem; caso contrário, abre o aplicativo sem conceder acesso.

QA em dispositivo: negar/revogar permissão; ativar somente um período; pausar; desligar detalhes; alterar horários/fuso; sair/trocar/excluir conta; restrição de segurança; expiração da assinatura; troca de mês; tocar com app fechado/aberto. Verificar coexistência com lembretes de sessões e ausência de duplicatas. A lógica de calendário/mensagens tem testes no pacote HerculesCore; entrega pelo iOS requer validação em aparelho.

## AI Coach nativo

**AI Coach → Conversar com o Hércules** consulta o backend comercial. Mostra a disponibilidade real e os provedores configurados, pede autorização antes do envio de perfil/plano/registros à IA, apresenta a conversa e permite apagar/revogar. Sem IA configurada, informa indisponibilidade. Perguntas não mudam o plano. Repetir a última pergunta após falha de rede usa o mesmo requestID enquanto a tela permanece aberta.

QA: autorização inicial; negar/revogar; exclusão; trocar conta; expiração da sessão; falha/timeout/cota do provedor; alteração do plano enquanto espera resposta; semanas bloqueadas; VoiceOver/Dynamic Type; perguntas em PT/EN/ES. A integração real depende da hospedagem e das chaves/modelos configurados no backend, separadamente da conta Apple.
