// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "ThymosTicket",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/awslabs/aws-sdk-swift.git", from: "1.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "ThymosTicket",
            dependencies: [
                .product(name: "AWSCognitoIdentityProvider", package: "aws-sdk-swift"),
            ],
            path: "Sources",
            resources: [
                .process("Resources/app-icon.png"),
                .copy("Resources/AppIcon.icns"),
            ]
        )
    ]
)
