// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HerculesCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "HerculesCore", targets: ["HerculesCore"])],
    targets: [
        .target(name: "HerculesCore"),
        .testTarget(name: "HerculesCoreTests", dependencies: ["HerculesCore"])
    ]
)
