import PhotosUI
import SwiftUI
import UIKit

struct MealRowView: View {
    @EnvironmentObject private var account: AccountStore
    let week: Int
    let day: Int
    let meal: MealContent
    let reload: () async -> Void
    @State private var photo: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var confirming = false
    @State private var busy = false
    @State private var checked = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(meal.title).font(.headline)
            CatalogImage(path: meal.image)
            DisclosureGroup("Preparo, porções e substituições") {
                Text(meal.recipe.portion)
                Text(meal.recipe.prep)
                Text(meal.recipe.subs)
            }
            HStack {
                Button(checked ? "Registrada" : "Registrar refeição") { Task { await action("check") } }
                Spacer()
                Button("Substituir") { Task { await action("replace") } }
            }
            PhotosPicker("Escolher foto da refeição", selection: $photo, matching: .images)
                .disabled(busy || !account.allows(.photo, week: week))
        }
        .disabled(busy || !account.allows(.meal, week: week))
        .onChange(of: photo) { _, item in
            Task {
                guard let raw = try? await item?.loadTransferable(type: Data.self), let image = UIImage(data: raw) else { return }
                let scale = min(1, 640 / max(image.size.width, image.size.height))
                let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
                guard let data = resized.jpegData(compressionQuality: 0.45), data.count < 180_000 else {
                    account.error = "Escolha uma imagem menor."
                    return
                }
                photoData = data
                confirming = true
            }
        }
        .sheet(isPresented: $confirming) {
            VStack(spacing: 16) {
                if let photoData, let image = UIImage(data: photoData) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 300)
                }
                Text("Confirme que esta foto corresponde à refeição. O servidor registra o hash da imagem e sua confirmação; não faz análise nutricional da foto.")
                    .padding()
                Button("Confirmar e registrar foto") { Task { await action("photo") } }.disabled(busy)
                Button("Cancelar") { confirming = false; photoData = nil; photo = nil }
            }.padding()
        }
    }

    private func action(_ action: String) async {
        guard let identity = account.account, account.allows(.meal, week: week), !busy else { return }
        busy = true
        defer { busy = false }
        do {
            var body = MealBody(week: week, day: day, mealID: meal.id, action: action)
            if action == "photo" {
                guard account.allows(.photo, week: week), let photoData else { return }
                body.confirmed = true
                body.image = photoData.base64EncodedString()
            }
            let result: Acknowledgement = try await account.api.request("account/meals", method: "POST",
                token: identity.accessToken, body: JSONEncoder().encode(body))
            guard result.ok, account.account?.accessToken == identity.accessToken else { return }
            if action == "check" { checked = true }
            if action == "photo" { confirming = false; photoData = nil; photo = nil }
            await reload()
        } catch { account.error = error.localizedDescription }
    }
}

