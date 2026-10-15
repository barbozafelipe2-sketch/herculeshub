import SwiftUI

struct PostWorkoutView: View {
    @EnvironmentObject private var account: AccountStore
    @Environment(\.scenePhase) private var scenePhase
    let week: Int
    let session: String
    @State private var completed: Set<String> = []
    @State private var seconds = 0
    @State private var breathing = false
    @State private var running: Task<Void, Never>?

    var body: some View {
        List {
            Section {
                Image(systemName: "drop.fill").font(.system(size: 48)).foregroundStyle(.blue)
                Text("Água").font(.headline)
                Text("Beba água conforme sua sede e orientação habitual.")
                Button(completed.contains("water") ? "Registrado" : "Registrar pausa para água") { Task { await record("water") } }
            }
            Section {
                Image(systemName: "figure.cooldown").font(.system(size: 48))
                Text("Volte a uma postura confortável").font(.headline)
                Text("Faça uma pausa em posição estável e confortável. Não force movimentos dolorosos.")
                Button(completed.contains("alignment") ? "Registrado" : "Registrar pausa") { Task { await record("alignment") } }
            }
            Section {
                Image(systemName: "lungs.fill").font(.system(size: 48)).foregroundStyle(.mint)
                Text("Respiração tranquila").font(.headline)
                Text("Respire naturalmente, sem prender o ar. Pare se sentir desconforto.")
                if breathing { Text("Tempo: \(seconds)/60 s").monospacedDigit() }
                Button(breathing ? "Parar" : "Iniciar pausa guiada de 60 segundos") {
                    if breathing { stop() } else { start() }
                }
                if completed.contains("breathing") { Text("Pausa registrada.") }
            }
        }
        .navigationTitle("Depois do treino")
        .disabled(!account.allows(.postWorkout, week: week))
        .onDisappear { stop() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { stop() } }
    }
    private func start() {
        seconds = 0
        breathing = true
        running = Task { @MainActor in
            do {
                while seconds < 60 {
                    try await Task.sleep(for: .seconds(1))
                    guard !Task.isCancelled else { return }
                    seconds += 1
                }
                breathing = false
                await record("breathing")
            } catch { breathing = false }
        }
    }
    private func stop() { running?.cancel(); running = nil; breathing = false }
    private func record(_ step: String) async {
        guard let identity = account.account, account.allows(.postWorkout, week: week) else { return }
        do {
            let result: Acknowledgement = try await account.api.request("account/post-workout", method: "POST",
                token: identity.accessToken, body: JSONEncoder().encode(PostWorkoutBody(week: week, session: session, step: step)))
            guard result.ok, account.account?.accessToken == identity.accessToken else { return }
            completed.insert(step)
        } catch { account.error = error.localizedDescription }
    }
}

