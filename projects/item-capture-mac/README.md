# ThymosTicket — Item Capture Mac App

A native macOS app for capturing consignment items with pricing suggestions, built with SwiftUI and SwiftData.

## Prerequisites

- **macOS 14** (Sonoma) or later
- **Xcode 15.3+** or the Swift 5.10 toolchain
- An active AWS Cognito user (for authentication)

## Build & Run

From the project directory:

```bash
cd projects/item-capture-mac
swift build
swift run ThymosTicket
```

The first build pulls the AWS SDK for Swift dependency — this can take a few minutes.

To open in Xcode instead:

```bash
open Package.swift
```

Then select the `ThymosTicket` scheme and hit ⌘R.

## Configuration

On first launch the app shows a login screen. Before signing in, open **Settings** (⌘,) and configure:

### AWS Cognito

| Setting | Key | Example |
|---------|-----|---------|
| User Pool ID | `cognitoUserPoolId` | `eu-central-1_AbCdEfG` |
| Client ID | `cognitoClientId` | `1a2b3c4d5e6f7g8h9i` |
| Region | `cognitoRegion` | `eu-central-1` |

### API

| Setting | Key | Default |
|---------|-----|---------|
| Base URL | `apiBaseURL` | `https://7ne4yil3k7.execute-api.eu-central-1.amazonaws.com` |

The API base URL defaults to the dev environment. Override it in Settings if pointing at a different stage.

## Architecture Overview

```
Sources/
├── ItemCaptureApp.swift        # App entry point, SwiftData container setup
├── Models/
│   ├── CanonicalValue.swift    # Normalized autocomplete values (brand, color, pattern, description)
│   ├── PricingRecord.swift     # Historical pricing data for suggestions
│   └── Category.swift          # Item categories
├── Services/
│   ├── APIClient.swift         # HTTP client for the Shop API
│   ├── AuthService.swift       # Cognito authentication (sign-in, token refresh)
│   ├── PricingEngine.swift     # Local price suggestion algorithm
│   └── SyncService.swift       # Syncs canonical values and pricing data from API
└── Views/
    ├── ContentView.swift       # Main layout (form + pricing panel)
    ├── ItemCaptureFormView.swift # Item input form with autocomplete fields
    ├── LoginView.swift         # Authentication screen
    └── SettingsView.swift      # App preferences (Cognito, API, printer)
```

## Data Flow

1. **Launch** → App restores Cognito session (or shows login)
2. **Sync** → `SyncService` fetches canonical values (brands, colors, patterns, descriptions) and pricing records from the Shop API
3. **Capture** → User fills item form; autocomplete fields suggest from synced canonical values
4. **Pricing** → `PricingEngine` computes a suggested tag price based on historical records, with adjustments for color, pattern, and size
5. **Save** → Item payload is POSTed to `/items` on the Shop API

## Troubleshooting

**"Not configured" error on sign-in**
→ Open Settings and fill in the Cognito User Pool ID and Client ID.

**Build fails with dependency resolution**
→ Run `swift package resolve` to force re-fetch dependencies.

**App doesn't appear in Dock**
→ The app sets `.regular` activation policy on launch. If running via `swift run`, make sure no sandbox restrictions apply.
