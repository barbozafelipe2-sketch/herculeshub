import SwiftUI
import UIKit

struct CatalogImage: View {
    let path: String
    var body: some View {
        Group {
            if let image = image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Image(systemName: "figure.strengthtraining.traditional").resizable().scaledToFit()
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxHeight: 160)
        .accessibilityHidden(true)
    }
    private var image: UIImage? {
        guard path.hasPrefix("assets/"), !path.contains(".."),
              let url = Bundle.main.url(forResource: String(path.dropFirst(7)), withExtension: nil, subdirectory: "Catalog") else { return nil }
        return UIImage(contentsOfFile: url.path)
    }
}

