import SwiftUI

struct ActiveWeekView: View {
    @EnvironmentObject private var account: AccountStore
    let week: Int
    @State private var content: WeekContent?
    @State private var energy = 3
    @State private var sleep = 3
    @State private var training = 0
    @State private var nutrition = 0
    @State private var activityMinutes = 0
    @State private var activityEffort = 0
    @State private var pain = false
    @State private var redFlag = false
    @State private var note = ""
    @State private var saving = false
    @State private var saved = false
    @State private var weight = ""
    @State private var waist = ""
    @State private var milestone = "baseline"
    @State private var reminderDate = Date().addingTimeInterval(3600)
    @State private var postWorkout: String?

    var body: some View {
        List {
            if account.allows(.checkin, week: week) {
                if let content {
                    Section("Treino") {
                        if account.allows(.training, week: week) {
                            DatePicker("Horário diário dos lembretes", selection: $reminderDate, displayedComponents: .hourAndMinute)
                            Button("Ativar lembretes dos treinos desta semana") { Task { await remindWeek() } }
                            ForEach(content.sessions) { session in
                                DisclosureGroup(session.id) {
                                    ForEach(session.rows) { exercise in
                                        VStack(alignment: .leading) {
                                            CatalogImage(path: exercise.image)
                                            Text(exercise.title).font(.headline)
                                            Text(exercise.rx)
                                        }
                                    }
                                    Button(content.completedSessions["w\(week):\(session.id)"] == true ? "Treino concluído — abrir pós-treino" : "Concluir treino") {
                                        Task { await complete(session.id) }
                                    }.disabled(saving)
                                    DatePicker("Lembrete", selection: $reminderDate, in: Date()...)
                                    Button("Ativar lembrete deste treino") { Task { await remind(session.id) } }
                                }
                            }
                        } else { Text("Treino restrito por segurança.") }
                    }
                    ForEach(content.days) { day in
                        Section("Alimentação — dia \(day.day + 1)") {
                            ForEach(Array(day.rows.enumerated()), id: \.offset) { _, meal in
                                MealRowView(week: week, day: day.day, meal: meal, reload: load)
                            }
                        }
                    }
                    if content.days.isEmpty {
                        Text("As refeições específicas aguardam revisão de segurança ou alergias.")
                    }
                    Section("Check-in") {
                        Stepper("Energia: \(energy)", value: $energy, in: 1...5)
                        Stepper("Sono: \(sleep)", value: $sleep, in: 1...5)
                        feedback("Treino", value: $training)
                        feedback("Alimentação", value: $nutrition)
                        Stepper("Outra atividade: \(activityMinutes) minutos", value: $activityMinutes, in: 0...600, step: 5)
                        Picker("Esforço da outra atividade", selection: $activityEffort) {
                            Text("Não informado").tag(0)
                            ForEach(1...10, id: \.self) { Text("\($0)/10").tag($0) }
                        }
                        Toggle("Dor ou limitação", isOn: $pain)
                        Toggle("Sintoma de alerta", isOn: $redFlag)
                        TextField("Observações", text: $note, axis: .vertical)
                        Button(saved ? "Check-in salvo" : "Salvar check-in") { Task { await saveCheckin() } }.disabled(saving)
                    }
                    Section("Medidas e evolução") {
                        Picker("Registro", selection: $milestone) {
                            Text("Inicial").tag("baseline")
                            Text("Dia 15").tag("checkpoint")
                            Text("Final (dia 28+)").tag("finalMark")
                        }
                        TextField("Peso (nas unidades do perfil)", text: $weight).keyboardType(.decimalPad)
                        TextField("Cintura (opcional)", text: $waist).keyboardType(.decimalPad)
                        Button("Salvar medida") { Task { await saveMilestone() } }.disabled(saving || weight.isEmpty)
                    }
                    if let postWorkout {
                        NavigationLink("Abrir pós-treino") { PostWorkoutView(week: week, session: postWorkout) }
                    }
                } else {
                    Button("Carregar semana") { Task { await load() } }
                }
            } else { Label("Esta semana está bloqueada.", systemImage: "lock.fill") }
        }
        .navigationTitle("Semana \(week)")
        .task { await load() }
    }

    private func feedback(_ title: String, value: Binding<Int>) -> some View {
        Picker(title, selection: value) {
            Text("Não informado").tag(0)
            ForEach(1...5, id: \.self) { Text("\($0)/5").tag($0) }
        }
    }
    private func load() async {
        guard account.allows(.checkin, week: week), let identity = account.account else { return }
        do {
            let response: WeekContent = try await account.api.request("account/weeks/\(week)", token: identity.accessToken)
            guard account.account?.accessToken == identity.accessToken else { return }
            content = response
        } catch { account.error = error.localizedDescription }
    }
    private func write<Body: Encodable>(_ path: String, _ body: Body) async throws {
        guard let identity = account.account, account.allows(.checkin, week: week) else { throw APIError.signInRequired }
        let result: Acknowledgement = try await account.api.request(path, method: "POST", token: identity.accessToken,
            body: JSONEncoder().encode(body))
        guard result.ok, account.account?.accessToken == identity.accessToken else { throw APIError.invalidResponse }
    }
    private func complete(_ session: String) async {
        guard !saving, account.allows(.training, week: week) else { return }
        saving = true
        defer { saving = false }
        do {
            try await write("account/sessions", SessionBody(week: week, session: session))
            postWorkout = session
            await load()
            try await account.syncDailyReminders()
        } catch { account.error = error.localizedDescription }
    }
    private func remind(_ session: String) async {
        guard let identity = account.account, account.allows(.reminder, week: week), account.allows(.training, week: week) else { return }
        do {
            // Fetch again so scheduling does not rely solely on a stale client entitlement.
            let verified: WeekContent = try await account.api.request("account/weeks/\(week)", token: identity.accessToken)
            guard account.account?.accessToken == identity.accessToken,
                  verified.sessions.contains(where: { $0.id == session }), account.allows(.training, week: week) else { return }
            try await ReminderService.schedule(week: week, session: session, at: reminderDate)
            account.error = "Lembrete agendado."
        } catch { account.error = error.localizedDescription }
    }
    private func remindWeek() async {
        guard let identity = account.account, account.allows(.reminder, week: week), account.allows(.training, week: week) else { return }
        do {
            let verified: WeekContent = try await account.api.request("account/weeks/\(week)", token: identity.accessToken)
            guard account.account?.accessToken == identity.accessToken, !verified.sessions.isEmpty else { return }
            let count = try await ReminderService.scheduleWeek(week: week, startedAt: verified.startedAt,
                sessions: verified.sessions.map(\.id), days: verified.sessionDays, time: reminderDate)
            account.error = "\(count) lembrete(s) agendado(s) para os dias do seu treino."
        } catch { account.error = error.localizedDescription }
    }
    private func saveCheckin() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            try await write("account/checkins", ProgressCheckinBody(week: week, energy: energy, sleep: sleep,
                training: training == 0 ? nil : training, nutrition: nutrition == 0 ? nil : nutrition,
                painFlag: pain, redFlagSymptom: redFlag, note: note,
                activityMinutes: activityMinutes == 0 ? nil : activityMinutes, activityEffort: activityEffort == 0 ? nil : activityEffort))
            saved = true
            await account.refresh()
        } catch { account.error = error.localizedDescription }
    }
    private func saveMilestone() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            try await write("account/milestones", MilestoneBody(week: week, kind: milestone, weight: weight, waist: waist))
            account.error = "Medida salva."
        } catch { account.error = error.localizedDescription }
    }
}

