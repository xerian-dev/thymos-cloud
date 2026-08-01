// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "ItemCapture",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/awslabs/aws-sdk-swift.git", from: "1.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "ItemCapture",
            dependencies: [
                .product(name: "AWSCognitoIdentityProvider", package: "aws-sdk-swift"),
            ],
            path: "Sources"
        )
    ]
)
