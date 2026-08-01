// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "ItemCapture",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "ItemCapture",
            path: "Sources"
        )
    ]
)
