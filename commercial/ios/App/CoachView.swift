import SwiftUI

struct CoachMessage: Decodable, Identifiable {
    let id: UUID
    let role: String
    let text: String
    let at: String
}
struct CoachStatus: Decodable {
    let available: Bool
    let providers: [String]
    let consented: Bool
    let messages: [CoachMessage]
}
struct CoachAnswer: Decodable { let message: CoachMessage; let provider: String; let authoritativeState: Bool }
private struct CoachQuestion: Encodable { let question: String; let requestID: UUID }
private struct CoachConsent: Encodable { let accepted: Bool }

struct CoachView: View {
    @EnvironmentObject private var account: AccountStore
    @State private var status: CoachStatus?
    @State private var messages: [CoachMessage] = []
    @State private var question = ""
    @State private var busy = false
    @State private var error: String?
    @State private var pendingQuestion: String?
    @State private var pendingID: UUID?
    @State private var clearConfirmation = false

    var body: some View {
        List {
            Section {
                Text("Converse sobre seu treino, alimentação e recuperação com base no seu plano e nos registros que você informou.")
                Text("O Coach não altera seu plano nem libera restrições. Mudanças passam pela revisão no aplicativo.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let status {
                if !status.available {
                    Section { Text("O AI Coach está indisponível no momento. Tente novamente mais tarde.") }
                }
                if !status.consented {
                    Section("Ativar AI Coach") {
                        Text("Para personalizar as respostas, enviaremos seu perfil, plano das semanas liberadas, registros recentes e conversa aos serviços de IA configurados: \(providerNames(status.providers)). Não enviamos credenciais nem fotos. Provedores alternativos podem ser usados se um serviço falhar.")
                        Text("As últimas 20 mensagens ficam salvas na sua conta. Você pode apagar a conversa ou revogar esta autorização a qualquer momento. Consulte a política de privacidade para o tratamento pelos provedores.")
                            .font(.footnote)
                        if let url = account.api.configuration.privacyURL { Link("Política de privacidade", destination: url) }
                        Button("Autorizar e ativar AI Coach") { Task { await consent(true) } }
                            .disabled(busy || !status.available || account.api.configuration.privacyURL == nil)
                    }
                } else {
                    Section("Conversa") {
                        if messages.isEmpty { Text("Como posso ajudar com seu plano de hoje?").foregroundStyle(.secondary) }
                        ForEach(messages) { message in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(message.role == "user" ? "Você" : "AI Coach Hércules").font(.caption).bold()
                                Text(message.text).textSelection(.enabled)
                            }.padding(.vertical, 4)
                        }
                    }
                    Section {
                        TextField("Pergunte ao Hércules", text: $question, axis: .vertical)
                            .lineLimit(2...6)
                            .onChange(of: question) { _, value in
                                if value.count > 2000 { question = String(value.prefix(2000)) }
                            }
                        Button(busy ? "Consultando…" : "Enviar") { Task { await send() } }
                            .disabled(busy || !status.available || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Button("Apagar conversa", role: .destructive) { clearConfirmation = true }.disabled(busy)
                        Button("Revogar autorização e apagar conversa", role: .destructive) { Task { await consent(false) } }
                            .disabled(busy)
                    }
                }
            } else if busy { ProgressView("Carregando Coach…") }
            if let error {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    Button("Atualizar") { Task { await load() } }.disabled(busy)
                }
            }
        }
        .navigationTitle("AI Coach")
        .task { await load() }
        .confirmationDialog("Apagar a conversa salva?", isPresented: $clearConfirmation, titleVisibility: .visible) {
            Button("Apagar conversa", role: .destructive) { Task { await clear() } }
        }
    }
    private func providerNames(_ names: [String]) -> String {
        let labels = ["gemini": "Google Gemini", "anthropic": "Anthropic Claude", "openai": "OpenAI", "openrouter": "OpenRouter e seus provedores de modelos"]
        return names.map { labels[$0] ?? $0 }.joined(separator: ", ")
    }
    private func load() async {
        guard !busy, let identity = account.account else { return }
        busy = true; defer { busy = false }
        do {
            let response: CoachStatus = try await account.api.request("account/coach", token: identity.accessToken)
            guard account.account?.accessToken == identity.accessToken else { return }
            status = response; messages = response.messages; error = nil
        } catch { self.error = message(for: error) }
    }
    private func consent(_ accepted: Bool) async {
        guard !busy, let identity = account.account else { return }
        busy = true
        do {
            let result: Acknowledgement = try await account.api.request("account/coach/consent", method: "POST", token: identity.accessToken,
                body: JSONEncoder().encode(CoachConsent(accepted: accepted)))
            guard result.ok, account.account?.accessToken == identity.accessToken else { throw APIError.signInRequired }
            pendingID = nil; pendingQuestion = nil
            if !accepted { messages = []; question = "" }
            busy = false; await load()
        } catch { self.error = message(for: error); busy = false }
    }
    private func send() async {
        guard !busy, let identity = account.account else { return }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 2000 else { return }
        if pendingQuestion != text { pendingID = UUID(); pendingQuestion = text }
        guard let requestID = pendingID else { return }
        busy = true
        do {
            let response: CoachAnswer = try await account.api.request("account/coach", method: "POST", token: identity.accessToken,
                body: JSONEncoder().encode(CoachQuestion(question: text, requestID: requestID)))
            guard response.authoritativeState, account.account?.accessToken == identity.accessToken else { throw APIError.invalidResponse }
            question = ""; pendingQuestion = nil; pendingID = nil
            busy = false; await load()
        } catch {
            if case APIError.rejected(409) = error { pendingID = nil; pendingQuestion = nil }
            self.error = message(for: error); busy = false
        }
    }
    private func clear() async {
        guard !busy, let identity = account.account else { return }
        busy = true
        do {
            let result: Acknowledgement = try await account.api.request("account/coach", method: "DELETE", token: identity.accessToken)
            guard result.ok, account.account?.accessToken == identity.accessToken else { throw APIError.signInRequired }
            messages = []; pendingID = nil; pendingQuestion = nil
            busy = false; await load()
        } catch { self.error = message(for: error); busy = false }
    }
    private func message(for error: Error) -> String {
        switch error {
        case APIError.rejected(401): return "Sua sessão expirou. Entre novamente para conversar com o Coach."
        case APIError.rejected(403): return "Autorize o uso dos dados para ativar o Coach."
        case APIError.rejected(409): return "O plano ou a conversa mudou. Atualize e tente novamente."
        case APIError.rejected(429): return "Você atingiu o limite de mensagens. Tente novamente mais tarde."
        case APIError.rejected(503): return "O AI Coach está indisponível no momento. Sua pergunta foi preservada para tentar novamente."
        default: return "Não foi possível consultar o Coach. Confira sua conexão e tente novamente."
        }
    }
}
