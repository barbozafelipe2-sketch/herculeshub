import AuthenticationServices
import HerculesCore
import StoreKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject private var account: AccountStore
    @EnvironmentObject private var commerce: StoreKitStore
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var reminderRouter = ReminderNotificationRouter.shared
    @State private var reminderPath: [Int] = []
    @State private var deleteConfirmation = false
    @State private var reportURL: URL?
    @State private var importingReport = false

    var body: some View {
        NavigationStack(path: $reminderPath) {
            Group {
                if account.account == nil { signIn }
                else if account.needsOnboarding { OnboardingView() }
                else { month }
            }
            .navigationTitle("Hércules Hub")
            .navigationDestination(for: Int.self) { week in
                if account.allows(.checkin, week: week) { ActiveWeekView(week: week) }
                else { Text("Abra o plano atual para conferir as semanas disponíveis.") }
            }
            .onReceive(reminderRouter.$destination) { destination in
                guard let destination else { return }
                reminderPath = []
                if account.account?.accountID == destination.accountID,
                   account.month?.id == destination.monthID,
                   account.allows(.checkin, week: destination.week) {
                    reminderPath = [destination.week]
                }
                reminderRouter.consume()
            }
            .toolbar {
                if account.account != nil {
                    Menu("Conta", systemImage: "person.crop.circle") {
                        NavigationLink("Mensagens diárias") { DailyReminderSettingsView() }
                        Button("Restaurar compras") { Task { await commerce.restore() } }
                        Button("Gerenciar assinatura") { Task { await manageSubscription() } }
                        Button("Restaurar progresso do PDF") { importingReport = true }
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
            .fileImporter(isPresented: $importingReport, allowedContentTypes: [.pdf]) { result in
                Task { await restoreReport(result) }
            }
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
        .id(account.account?.accountID)
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
            Section("AI Coach") {
                NavigationLink("Conversar com o Hércules") { CoachView() }
            }
            Section("Sua rotina") {
                NavigationLink("Mensagens diárias") { DailyReminderSettingsView() }
            }
            Section("Evolução") {
                NavigationLink("Revisar próximo mês") { NextMonthView() }
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
            guard account.account?.accessToken == identity.accessToken else { return }
            removeReport()
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("hercules-\(UUID())")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                   attributes: [.protectionKey: FileProtectionType.complete])
            let url = directory.appendingPathComponent("Hercules-month.pdf")
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            reportURL = url
        } catch { account.error = error.localizedDescription }
    }
    private func restoreReport(_ result: Result<URL, Error>) async {
        guard let identity = account.account else { return }
        do {
            let url = try result.get()
            let permitted = url.startAccessingSecurityScopedResource()
            defer { if permitted { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            guard data.count <= 2_000_000,
                  let text = String(data: data, encoding: .isoLatin1),
                  let marker = text.range(of: "%%HERCULES_BACKUP ") else { throw APIError.invalidResponse }
            let tail = text[marker.upperBound...]
            let archive = String(tail.prefix { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
            let response: Acknowledgement = try await account.api.request("account/restore", method: "POST", token: identity.accessToken,
                body: JSONEncoder().encode(RestoreBody(archive: archive)))
            guard response.ok, account.account?.accessToken == identity.accessToken else { throw APIError.invalidResponse }
            await account.refresh()
            account.error = "Progresso verificado. Dados já existentes no servidor foram preservados."
        } catch { account.error = error.localizedDescription }
    }

}
