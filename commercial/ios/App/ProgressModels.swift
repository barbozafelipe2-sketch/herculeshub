import Foundation
struct SessionContent: Decodable, Identifiable {
    let id: String
    let rows: [ExerciseContent]
}
struct ExerciseContent: Decodable, Identifiable {
    let id: String
    let title: String
    let rx: String
    let image: String
}
struct MealDay: Decodable, Identifiable {
    let day: Int
    let rows: [MealContent]
    var id: Int { day }
}
struct MealContent: Decodable, Identifiable {
    let id: String
    let role: String
    let occurrence: Int
    let title: String
    let image: String
    let recipe: RecipeContent
}
struct RecipeContent: Decodable {
    let portion: String
    let prep: String
    let subs: String
}
struct SessionBody: Encodable { let week: Int; let session: String }
struct PostWorkoutBody: Encodable { let week: Int; let session: String; let step: String }
struct MealBody: Encodable {
    let week: Int
    let day: Int
    let mealID: String
    let action: String
    var confirmed: Bool? = nil
    var image: String? = nil
}
struct ProgressCheckinBody: Encodable {
    let week: Int
    let energy: Int
    let sleep: Int
    let training: Int?
    let nutrition: Int?
    let painFlag: Bool
    let redFlagSymptom: Bool
    let note: String
    let activityMinutes: Int?
    let activityEffort: Int?
}
struct MilestoneBody: Encodable { let week: Int; let kind: String; let weight: String; let waist: String }
struct RestoreBody: Encodable { let archive: String }
struct CycleProposal: Decodable, Identifiable {
    let proposalID: String
    let requiresReview: Bool
    let trainingAction: String
    let nutritionAction: String
    let recoveryAction: String
    let summary: String
    var id: String { proposalID }
}
struct ApprovalBody: Encodable {
    let proposalID: String
    let approveDiet: Bool
    let approveCalendar: Bool
}

