import SwiftUI
struct NextMonthView: View {
    @EnvironmentObject private var account: AccountStore
    @State private var proposal: CycleProposal?
    @State private var diet = false
    @State private var calendar = false
    @State private var busy = false
    @State private var activated = false

    var body: some View {
        Form {
            Section {
                Text("O próximo mês usa suas sessões concluídas, check-ins e medidas. Nenhuma alteração será aplicada sem sua aprovação.")
                Button("Preparar proposta") { Task { await propose() } }.disabled(busy)
            }
            if let proposal {
                Section("Proposta para revisão") {
                    Text(proposal.summary)
                    if proposal.requiresReview {
                        Text("Há uma revisão de segurança pendente. Sua aprovação não remove essa restrição.")
                            .foregroundStyle(.red)
                    } else {
                        Toggle("Aprovo os ajustes na alimentação", isOn: $diet)
                        Toggle("Aprovo os ajustes de treino e calendário", isOn: $calendar)
                        Button("Aprovar e iniciar próximo mês") { Task { await approve(proposal) } }
                            .disabled(busy || !diet || !calendar)
                    }
                }
            }
            if activated { Text("Próximo mês iniciado.").foregroundStyle(.green) }
        }
        .navigationTitle("Evolução")
    }
    private func propose() async {
        guard let session = account.account else { return }
        busy = true
        defer { busy = false }
        do {
            let found: CycleProposal = try await account.api.request("account/next-month/propose", method: "POST", token: session.accessToken)
            guard account.account?.accessToken == session.accessToken else { return }
            proposal = found
            diet = false
            calendar = false
        } catch { account.error = error.localizedDescription }
    }
    private func approve(_ proposal: CycleProposal) async {
        guard let session = account.account else { return }
        busy = true
        defer { busy = false }
        do {
            let result: OnboardingResponse = try await account.api.request("account/next-month/approve", method: "POST", token: session.accessToken,
                body: JSONEncoder().encode(ApprovalBody(proposalID: proposal.proposalID, approveDiet: diet, approveCalendar: calendar)))
            guard result.ok, account.account?.accessToken == session.accessToken else { throw APIError.invalidResponse }
            self.proposal = nil
            activated = true
            await account.refresh()
        } catch { account.error = error.localizedDescription }
    }
}

