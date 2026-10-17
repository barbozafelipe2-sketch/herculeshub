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


## AI Coach comercial

O Coach acompanha o comportamento de `hercules-hub/netlify/functions/coach.mts`, mas usa a sessão Apple e o estado comercial autoritativo. É conversacional e somente leitura: não altera o plano, não aprova ciclos, não muda assinatura nem libera restrições. Não usa Netlify Gateway; os adaptadores Node chamam os provedores no backend. Nenhuma chave vai para o app.

Desativado por padrão. Para ativar na hospedagem, configure `HERCULES_COACH_ENABLED=true` e pelo menos um par chave/modelo **com modelo realmente disponível na sua conta**:

| Provedor | Chave secreta | Modelo explícito |
| --- | --- | --- |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |

`HERCULES_COACH_PROVIDERS` define a ordem; padrão `gemini,anthropic,openai,openrouter`. Somente pares configurados entram na cadeia. Não há nome de modelo presumido. Timeouts: 4s por tentativa, orçamento total de 12s; respostas limitadas a 128KB/12.000 caracteres. Configure também orçamento/alertas no provedor e políticas de retenção/região apropriadas. Custos de IA são separados da conta Apple.

O usuário autoriza no app antes de qualquer pergunta. A autorização registra a lista dos provedores; mudar a lista exige nova autorização. Contexto: perfil sem o campo nome, plano/refeições das semanas liberadas, sete check-ins recentes e até dez mensagens anteriores. Não enviamos tokens, fotos, chaves nem dados de outra conta. Restrições/alergias são preservadas no contexto. O provedor gera texto, não ações. O motor determinístico continua responsável pelo planejamento.

Histórico: últimas 20 mensagens, criptografadas junto dos dados da conta; apagar conversa remove também a resposta guardada para repetição segura. Revogar autorização apaga o histórico. Excluir conta remove os dados conforme o fluxo existente. Especifique na política pública os provedores utilizados e seu tratamento de dados; revogação local não promete apagar registros que o provedor já tenha retido.

Limites por conta persistidos em SQLite: 30 perguntas/hora e 80/dia, uma resposta em andamento por conta nesta instância. As tentativas podem consumir cota/custo mesmo em falha. `requestID` evita cobrança duplicada na repetição da última pergunta concluída. Mudanças no estado/consentimento durante a resposta impedem a publicação de contexto antigo. Sem provedor ou em falha, retorna `503 coach_unavailable`; não há resposta determinística apresentada como IA.

Teste real pendente: configurar um provedor na hospedagem, validar PT/EN/ES, latência/custo, autorização/revogação, erros, perguntas sobre semanas bloqueadas, alergias/restrições e privacidade. Os testes automatizados usam transporte de IA simulado e não comprovam disponibilidade do modelo ou segurança clínica das respostas.


## Sessões Apple renováveis

Publique este backend antes do cliente novo: `POST /auth/apple/session` agora inclui `refreshToken`, `accessExpiresAt` e `refreshExpiresAt`. Clientes antigos podem ignorar os campos extras. SQLite recebe uma migração aditiva (`refresh_sessions` e `sessions.family_id`); sessões antigas continuam com a validade original de uma hora. Faça backup do volume antes de atualizar.

O refresh comercial é aleatório, por dispositivo, com hash no banco e validade absoluta de 30 dias; não é o refresh token da Apple. A cada renovação, o backend valida a autorização com o token Apple guardado cifrado e só então emite o novo par comercial. `invalid_grant` da Apple revoga todas as sessões da conta; indisponibilidade temporária retorna 503 sem apagar as credenciais. Tokens de acesso já emitidos podem durar até uma hora, salvo revogação da família, exclusão ou notificação de revogação tratada pelo app.

Rotação atômica substitui o acesso anterior. Uma repetição do token imediatamente anterior recebe a mesma resposta por 60 segundos para recuperar resposta perdida; a resposta fica cifrada no banco. Reuso desse token após a janela revoga a família. Tokens mais antigos que a geração anterior são rejeitados sem atribuição de família. Não há extensão dos 30 dias. Renovação conserva a data do login Apple original: não satisfaz o requisito de confirmação recente para exclusão.

`POST /auth/session/revoke` aceita o refresh como prova e é idempotente, mesmo com acesso expirado. `POST /account/logout` revoga toda a família do acesso atual. Outra sessão legítima em outro aparelho continua ativa. Exclusão de conta remove todas as famílias. Não registre corpos de requisição, cabeçalhos Authorization ou tokens em logs do proxy/servidor.

Os testes verificam rotação, reinício do SQLite, migração, repetição, expiração, revogação, exclusão e bloqueio das semanas pagas. Rede Apple é simulada; validar em Sandbox/dispositivo real após configurar conta e hospedagem.
