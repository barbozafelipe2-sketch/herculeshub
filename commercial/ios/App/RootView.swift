import AuthenticationServices
import HerculesCore
import StoreKit
import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var account: AccountStore
    @EnvironmentObject private var commerce: StoreKitStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var deleteConfirmation = false
    @State private var reportURL: URL?

    var body: some View {
        NavigationStack {
            Group {
                if account.account == nil { signIn }
                else { month }
            }
            .navigationTitle("Hércules Hub")
            .toolbar {
                if account.account != nil {
                    Menu("Conta", systemImage: "person.crop.circle") {
                        Button("Restaurar compras") { Task { await commerce.restore() } }
                        Button("Gerenciar assinatura") { Task { await manageSubscription() } }
                        Button("Exportar relatório") { Task { await exportReport() } }
                        Button("Sair") { account.signOut() }
                        Button("Excluir conta", role: .destructive) { deleteConfirmation = true }
                    }
                }
            }
            .confirmationDialog("Excluir sua conta e seus dados?", isPresented: $deleteConfirmation, titleVisibility: .visible) {
                Button("Excluir definitivamente", role: .destructive) {
                    Task {
                        do { try await account.deleteAccount(); removeReport() }
                        catch { account.error = error.localizedDescription }
                    }
                }
            } message: {
                Text("Excluir a conta não cancela a assinatura Apple. Gerencie a assinatura antes de excluir.")
            }
            .alert("Hércules Hub", isPresented: Binding(get: { account.error != nil || commerce.message != nil },
                                                      set: { if !$0 { account.error = nil; commerce.message = nil } })) {
                Button("OK") { account.error = nil; commerce.message = nil }
            } message: { Text(account.error ?? commerce.message ?? "") }
            .task { await commerce.load() }
            .task(id: account.account?.accountID) {
                removeReport()
                guard account.account != nil else { return }
                do { try await commerce.reconcile() }
                catch { commerce.message = error.localizedDescription }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await account.refresh() } }
            }
        }
    }

    private var signIn: some View {
        VStack(spacing: 20) {
            Text("Seu treino, alimentação e evolução em um só lugar.")
                .multilineTextAlignment(.center)
            if account.api.configuration.baseURL == nil {
                Text("O serviço comercial ainda não está disponível.").foregroundStyle(.secondary)
            } else if account.signInReady {
                SignInWithAppleButton(.signIn, onRequest: account.configure) { result in
                    Task { await account.signIn(result) }
                }
                .frame(height: 50)
            } else {
                Button("Entrar com Apple") { Task { await account.prepareSignIn() } }
                    .disabled(account.busy)
            }
            if account.busy { ProgressView() }
        }
        .padding()
    }

    private var month: some View {
        List {
            if let plan = account.month {
                Section("Mês \(plan.cycleNumber)") {
                    if plan.trainingHold {
                        Text("Treino restrito por segurança. A assinatura não remove essa restrição.")
                            .foregroundStyle(.red)
                    }
                    ForEach(plan.weeks) { week in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Semana \(week.number) — \(week.title)").font(.headline)
                            Text(week.summary)
                            if account.allows(.checkin, week: week.number) {
                                NavigationLink("Abrir semana") { ActiveWeekView(week: week.number) }
                            } else {
                                Label("Bloqueada — assinatura necessária", systemImage: "lock.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }
                Section {
                    if let url = reportURL { ShareLink("Compartilhar relatório PDF", item: url) }
                    Text("O mês inteiro permanece visível. Sem assinatura, a semana liberada pode ser utilizada.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                Section {
                    Text("Nenhum plano disponível.")
                    Button("Atualizar plano") { Task { await account.refresh() } }
                }
            }
            Section("Assinatura") {
                if let product = commerce.product {
                    Text(product.displayName)
                    Text(product.description)
                    Text("\(product.displayPrice) por mês. Renovação automática até o cancelamento.")
                    Button("Assinar") { Task { await commerce.purchase() } }
                        .disabled(commerce.busy || !account.api.configuration.purchaseConfigured)
                } else {
                    Text("Assinatura indisponível no momento.").foregroundStyle(.secondary)
                }
                Button("Restaurar compras") { Task { await commerce.restore() } }
                    .disabled(commerce.busy)
                if let url = account.api.configuration.privacyURL { Link("Privacidade", destination: url) }
                if let url = account.api.configuration.termsURL { Link("Termos de uso", destination: url) }
            }
        }
        .refreshable { await account.refresh() }
    }

    private func manageSubscription() async {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
        do { try await AppStore.showManageSubscriptions(in: scene) }
        catch { account.error = error.localizedDescription }
    }

    private func removeReport() {
        if let reportURL { try? FileManager.default.removeItem(at: reportURL) }
        reportURL = nil
    }

    private func exportReport() async {
        guard let identity = account.account else { return }
        do {
            let data = try await account.api.report(token: identity.accessToken)
            removeReport()
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("hercules-\(UUID())")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.complete])
            let url = directory.appendingPathComponent("Hercules-month.pdf")
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            reportURL = url
        } catch { account.error = error.localizedDescription }
    }
}

struct ActiveWeekView: View {
    @EnvironmentObject private var account: AccountStore
    let week: Int
    @State private var content: WeekContent?
    @State private var energy = 3
    @State private var sleep = 3
    @State private var saving = false
    @State private var saved = false

    var body: some View {
        List {
            if account.allows(.checkin, week: week) {
                if let content {
                    Section("Treino") {
                        if account.allows(.training, week: week) {
                            ForEach(Array(content.training.enumerated()), id: \.offset) { _, item in Text(item) }
                        } else { Text("Treino restrito por segurança.") }
                    }
                    Section("Alimentação") {
                        ForEach(Array(content.meals.enumerated()), id: \.offset) { _, item in Text(item) }
                    }
                    Section("Check-in") {
                        Stepper("Energia: \(energy)", value: $energy, in: 1...5)
                        Stepper("Sono: \(sleep)", value: $sleep, in: 1...5)
                        Button(saved ? "Check-in salvo" : "Salvar check-in") { Task { await save() } }
                            .disabled(saving)
                    }
                } else { ProgressView() }
            } else { Label("Esta semana está bloqueada.", systemImage: "lock.fill") }
        }
        .navigationTitle("Semana \(week)")
        .task { await load() }
    }

    private func load() async {
        guard account.allows(.checkin, week: week), let identity = account.account else { return }
        do { content = try await account.api.request("account/weeks/\(week)", token: identity.accessToken) }
        catch { account.error = error.localizedDescription }
    }

    private func save() async {
        guard !saving, account.allows(.checkin, week: week), let identity = account.account else { return }
        saving = true
        defer { saving = false }
        do {
            let result: Acknowledgement = try await account.api.request("account/checkins", method: "POST",
                token: identity.accessToken, body: JSONEncoder().encode(CheckinBody(week: week, energy: energy, sleep: sleep)))
            guard result.ok else { throw APIError.invalidResponse }
            saved = true
        } catch { account.error = error.localizedDescription }
    }
}

