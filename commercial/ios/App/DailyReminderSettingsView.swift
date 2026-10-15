import HerculesCore
import SwiftUI
import UIKit

struct DailyReminderSettingsView: View {
    @EnvironmentObject private var account: AccountStore
    @State private var preferences = DailyReminderPreferences()
    @State private var saving = false
    @State private var message: String?
    var body: some View {
        Form {
            Section("Seu dia com o Hércules") {
                Toggle("Mensagem da manhã", isOn: $preferences.morningEnabled)
                if preferences.morningEnabled {
                    DatePicker("Bom dia às", selection: clock(\.morningMinute), displayedComponents: .hourAndMinute)
                }
                Toggle("Lembrete de descanso à noite", isOn: $preferences.eveningEnabled)
                if preferences.eveningEnabled {
                    DatePicker("Descanso às", selection: clock(\.eveningMinute), displayedComponents: .hourAndMinute)
                }
            }
            Section("Privacidade") {
                Toggle("Citar o treino na notificação", isOn: $preferences.includePlanDetails)
                Text("Desativado: a mensagem convida a consultar o plano. Ativado: o treino ou o dia de descanso pode aparecer na tela bloqueada. Não incluímos medidas, alimentação ou informações de saúde.")
                    .font(.footnote)
            }
            Section {
                Button(saving ? "Salvando…" : "Salvar preferências") { Task { await save() } }
                    .disabled(saving)
                if let message { Text(message).font(.footnote) }
                Button("Abrir ajustes de notificações") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                Text("Os horários seguem o fuso do aparelho ao agendar. Agendamos até 14 dias do mês atual e atualizamos ao abrir o app ou mudar o plano. Abra o Hércules regularmente e após mudar de fuso. Para pausar, desative as mensagens e salve. Entrega e som dependem dos ajustes do iPhone e do modo Foco.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Mensagens diárias")
        .task {
            if let id = account.account?.accountID { preferences = DailyReminderService.preferences(for: id) }
        }
    }
    private func clock(_ key: WritableKeyPath<DailyReminderPreferences, Int>) -> Binding<Date> {
        Binding(get: {
            let minutes = preferences[keyPath: key]
            return Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()) ?? Date()
        }, set: { date in
            let components = Calendar.current.dateComponents([.hour, .minute], from: date)
            preferences[keyPath: key] = (components.hour ?? 0) * 60 + (components.minute ?? 0)
        })
    }
    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await account.configureDailyReminders(preferences)
            message = preferences.enabled ? "Preferências salvas. Mensagens preparadas para o plano atual." : "Mensagens diárias pausadas."
        } catch { message = "Não foi possível concluir o agendamento. \(error.localizedDescription)" }
    }
}
