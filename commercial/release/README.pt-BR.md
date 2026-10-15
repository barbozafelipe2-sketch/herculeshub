# Quando você tiver a conta Apple

O código permanece preparado sem conta paga. Não foi criada assinatura, hospedagem ou cobrança. Login/compras reais ficam desativados enquanto a configuração estiver vazia.

## Agora, sem conta Apple

- O CI compila o iOS sem assinatura e executa os testes do app, motor e backend.
- Você pode abrir o projeto no simulador no Mac; o login real precisa da integração Apple.
- Execute `node commercial/release/prepare.mjs init` para criar a configuração local vazia. O comando preserva um arquivo já existente.
- Não precisa enviar senhas/chaves no chat. Arquivos locais de configuração e chaves ficam fora do Git.

## Depois de abrir a conta

1. Inscreva-se no Apple Developer Program e entre no App Store Connect. Em Xcode → Settings → Accounts, adicione sua conta.
2. Registre um Bundle ID com Sign in with Apple e crie o aplicativo no App Store Connect.
3. Cadastre a assinatura mensal em um grupo de assinaturas. Complete os contratos e dados comerciais exigidos pela Apple.
4. Obtenha Team ID, Bundle ID, ID do app e ID do produto. Crie as chaves de Sign in with Apple e App Store Server API para o backend.
5. Hospede o backend comercial com HTTPS e volume persistente. Configure Sandbox e Production separados, com suas respectivas notificações V2. As chaves privadas ficam no secret manager da hospedagem.
6. Publique política de privacidade, termos e página de suporte com os dados reais do responsável e da hospedagem. Prepare o ícone aprovado PNG RGB 1024×1024 sem alpha.
7. Preencha `commercial/release/config.local.json`: IDs públicos, URLs, versão/build e caminho do ícone relativo à raiz do repositório. **Não coloque chaves privadas nesse JSON.**
8. Valide: `node commercial/release/prepare.mjs check --environment Sandbox --archive`.
9. No Mac, gere o archive/IPA: `bash commercial/release/archive.sh Sandbox`. O script não envia nada automaticamente.
10. Envie pelo Xcode Organizer/Transporter ao TestFlight e valide login, compra pendente/cancelada, renovação/reembolso, restauração, relatórios, exclusão e notificações num dispositivo real.
11. Para a versão da loja, configure o endpoint Production, aumente buildNumber e execute o script com `Production`. TestFlight usa compras sandbox: use o backend Sandbox durante essa validação.
12. Complete screenshots, privacidade, classificação etária, informações de revisão e envio no App Store Connect. Enviar o app e aprovar compras são ações posteriores, não realizadas por este preparo.

## Comandos

```sh
node commercial/release/prepare.mjs init
node commercial/release/prepare.mjs check --environment Sandbox
node commercial/release/prepare.mjs render --environment Sandbox
bash commercial/release/archive.sh Sandbox
```

`check` informa os campos pendentes e retorna erro até preenchê-los. `render` gera xcconfig e ExportOptions locais; não verifica a disponibilidade de IDs nem autentica na Apple. O archive exige ícone e configuração completa, Mac, Xcode e assinatura válida.

O teste Netlify continua separado e pode ser usado enquanto você prepara a conta. Esta preparação não o altera.

