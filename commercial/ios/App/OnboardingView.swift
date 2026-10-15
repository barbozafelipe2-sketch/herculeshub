import SwiftUI
import HerculesCore

struct ProfileDraft: Encodable {
    var name = ""
    var language = "pt-BR"
    var primaryGoal = "general_fitness"
    var level = "beginner"
    var days = ["Mon", "Wed", "Fri"]
    var activityType = "none"
    var activityOther = ""
    var activityDays: [String] = []
    var location = "gym"
    var minutes = "45"
    var preferredTime = "09:00"
    var units = "metric"
    var height = ""
    var weight = ""
    var targetWeight = ""
    var meals = "3"
    var cooking = "basic"
    var foodPreferences = ""
    var dislikes = ""
    var allergies = ""
    var proteinPreferences: [String] = []
    var grainPreferences: [String] = []
    var veggiePreferences: [String] = []
    var openToOtherVeggies = true
    var foodStyles: [String] = []
    var mealPrepPreference = "mixed"
    var eatOutFrequency = "rare"
    var sleep = "7"
    var stress = "2"
    var currentPain = "no"
    var painAreas: [String] = []
    var redFlags = "no"
    var professionalRestrictions = "no"
    var professionalRestrictionScope = ""
    var safetyDetails = ""
    var accuracy = false
    var prototypeAck = false
}
struct OnboardingBody: Encodable { let profile: ProfileDraft }
struct OnboardingResponse: Decodable { let ok: Bool; let month: MonthPlan }

struct OnboardingView: View {
    @EnvironmentObject private var account: AccountStore
    @State private var draft = ProfileDraft()
    @State private var submitting = false
    private let weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        Form {
            Section("Seu perfil") {
                TextField("Nome", text: $draft.name).textContentType(.givenName)
                picker("Idioma do plano", $draft.language, ["pt-BR", "en-US", "es"])
                picker("Objetivo", $draft.primaryGoal, ["general_fitness", "build_muscle", "fat_loss", "consistency", "strength"])
                picker("Experiência", $draft.level, ["beginner", "intermediate", "advanced"])
                picker("Unidades", $draft.units, ["metric", "imperial"])
                TextField("Altura", text: $draft.height).keyboardType(.decimalPad)
                TextField("Peso atual", text: $draft.weight).keyboardType(.decimalPad)
                TextField("Peso de referência desejado", text: $draft.targetWeight).keyboardType(.decimalPad)
            }
            Section("Treino") {
                picker("Local", $draft.location, ["gym", "home", "both"])
                picker("Minutos por sessão", $draft.minutes, ["20", "30", "45", "60"])
                TextField("Horário preferido (HH:mm)", text: $draft.preferredTime)
                selections(weekdays, selected: $draft.days)
            }
            Section("Outras atividades") {
                picker("Atividade", $draft.activityType, ["none", "swimming", "cycling", "soccer", "running", "walking", "yoga", "dancing", "other"])
                if draft.activityType == "other" { TextField("Descreva a atividade", text: $draft.activityOther) }
                if draft.activityType != "none" { selections(weekdays, selected: $draft.activityDays) }
                Text("Natação, ciclismo e outras atividades fazem parte do registro de carga semanal.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Alimentação") {
                picker("Refeições por dia", $draft.meals, ["2", "3", "4", "5"])
                picker("Cozinha", $draft.cooking, ["minimal", "basic", "comfortable"])
                picker("Preparo", $draft.mealPrepPreference, ["mixed", "fresh_daily", "batch_cook"])
                picker("Refeições fora", $draft.eatOutFrequency, ["rare", "1-2_week", "3plus_week"])
                TextField("Preferências ou padrão alimentar (ex.: vegano)", text: $draft.foodPreferences, axis: .vertical)
                TextField("Alimentos que não gosta", text: $draft.dislikes, axis: .vertical)
                TextField("Alergias e intolerâncias", text: $draft.allergies, axis: .vertical)
                Toggle("Aceito outros vegetais", isOn: $draft.openToOtherVeggies)
                DisclosureGroup("Proteínas preferidas") { selections(["chicken", "beef", "eggs", "fish", "tofu", "beans", "yogurt"], selected: $draft.proteinPreferences) }
                DisclosureGroup("Acompanhamentos preferidos") { selections(["rice", "potato", "pasta", "oats", "quinoa"], selected: $draft.grainPreferences) }
                DisclosureGroup("Vegetais preferidos") { selections(["broccoli", "carrot", "tomato", "spinach", "lettuce"], selected: $draft.veggiePreferences) }
            }
            Section("Recuperação e segurança") {
                picker("Horas de sono", $draft.sleep, ["<5", "5", "6", "7", "8", "9+"])
                picker("Estresse (1 a 5)", $draft.stress, ["1", "2", "3", "4", "5"])
                yesNo("Tenho dor ou limitação atual", $draft.currentPain)
                if draft.currentPain == "yes" {
                    selections(["shoulder", "elbow", "wrist_hand", "neck", "upper_back", "low_back", "hip", "knee", "ankle_foot", "other"], selected: $draft.painAreas)
                }
                yesNo("Tenho sintomas de alerta não resolvidos", $draft.redFlags)
                yesNo("Recebi uma restrição profissional", $draft.professionalRestrictions)
                if draft.professionalRestrictions == "yes" {
                    picker("Orientação recebida", $draft.professionalRestrictionScope, ["", "avoid_specific", "no_exercise", "other_guidance"])
                }
                TextField("Detalhes relevantes", text: $draft.safetyDetails, axis: .vertical)
            }
            Section {
                Toggle("Confirmo que revisei os dados informados", isOn: $draft.accuracy)
                Toggle("Entendo que o app não faz diagnóstico nem substitui orientação profissional", isOn: $draft.prototypeAck)
                Button(submitting ? "Montando seu mês…" : "Criar meu mês") { Task { await submit() } }
                    .disabled(submitting || draft.name.trimmingCharacters(in: .whitespaces).isEmpty || draft.days.count < 2 || !draft.accuracy || !draft.prototypeAck)
            }
        }
        .navigationTitle("Seu primeiro mês")
    }

    private func submit() async {
        submitting = true
        defer { submitting = false }
        do { try await account.completeOnboarding(draft) }
        catch { account.error = error.localizedDescription }
    }
    private func picker(_ title: String, _ selection: Binding<String>, _ values: [String]) -> some View {
        Picker(title, selection: selection) {
            ForEach(values, id: \.self) { Text(label($0)).tag($0) }
        }
    }
    private func selections(_ values: [String], selected: Binding<[String]>) -> some View {
        ForEach(values, id: \.self) { value in
            Toggle(label(value), isOn: Binding(get: { selected.wrappedValue.contains(value) }, set: { on in
                if on { if !selected.wrappedValue.contains(value) { selected.wrappedValue.append(value) } }
                else { selected.wrappedValue.removeAll { $0 == value } }
            }))
        }
    }
    private func yesNo(_ title: String, _ selection: Binding<String>) -> some View {
        Toggle(title, isOn: Binding(get: { selection.wrappedValue == "yes" }, set: { selection.wrappedValue = $0 ? "yes" : "no" }))
    }
    private func label(_ value: String) -> String {
        let labels = ["general_fitness":"Condicionamento geral", "build_muscle":"Ganhar massa", "fat_loss":"Reduzir gordura",
            "consistency":"Consistência", "strength":"Força", "beginner":"Iniciante", "intermediate":"Intermediário", "advanced":"Avançado",
            "metric":"Métrico (kg/cm)", "imperial":"Imperial (lb/in)", "gym":"Academia", "home":"Casa", "both":"Casa e academia",
            "Mon":"Segunda", "Tue":"Terça", "Wed":"Quarta", "Thu":"Quinta", "Fri":"Sexta", "Sat":"Sábado", "Sun":"Domingo",
            "none":"Nenhuma", "swimming":"Natação", "cycling":"Ciclismo", "soccer":"Futebol", "running":"Corrida", "walking":"Caminhada",
            "yoga":"Yoga", "dancing":"Dança", "other":"Outra", "minimal":"Mínimo", "basic":"Básico", "comfortable":"Confortável",
            "mixed":"Misto", "fresh_daily":"Fresco diariamente", "batch_cook":"Preparo em lotes", "rare":"Raramente",
            "1-2_week":"1–2 por semana", "3plus_week":"3 ou mais por semana", "avoid_specific":"Evitar movimentos específicos",
            "no_exercise":"Não praticar exercícios", "other_guidance":"Outra orientação", "":"Selecione",
            "shoulder":"Ombro", "elbow":"Cotovelo", "wrist_hand":"Punho/mão", "neck":"Pescoço", "upper_back":"Costas",
            "low_back":"Lombar", "hip":"Quadril", "knee":"Joelho", "ankle_foot":"Tornozelo/pé"]
        return labels[value] ?? value
    }
}

