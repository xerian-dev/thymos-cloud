import SwiftUI

/// Side panel displaying the computed price suggestion from the local pricing engine.
/// Shows suggested price, confidence badge, explanation, and a "Use Suggestion" button.
struct PriceSuggestionPanelView: View {
    let suggestion: PriceSuggestion?
    let isLoading: Bool
    let onUseSuggestion: (Double) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with icon
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(AppTheme.softTeal)
                    .font(.subheadline)
                Text("Price Suggestion")
                    .font(.headline)
                    .foregroundStyle(AppTheme.darkAccent)
            }

            if isLoading {
                loadingView
            } else if let suggestion {
                suggestionView(suggestion)
            } else {
                emptyView
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(AppTheme.lightSage)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Price suggestion panel")
    }

    // MARK: - States

    private var loadingView: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
                .tint(AppTheme.primary)
            Text("Calculating...")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var emptyView: some View {
        Text("Waiting for item details...")
            .font(.callout)
            .foregroundStyle(.secondary)
    }

    private func suggestionView(_ suggestion: PriceSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Price + confidence badge
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("CHF \(suggestion.suggestedPrice, specifier: "%.2f")")
                    .font(.title2.bold().monospacedDigit())
                    .foregroundStyle(AppTheme.priceText)

                ConfidenceBadge(confidence: suggestion.confidence)
            }

            // Explanation
            Text(suggestion.explanation)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Sample size
            Text("\(suggestion.sampleSize) comparable items")
                .font(.caption)
                .foregroundStyle(.tertiary)

            // Use Suggestion button
            Button(action: { onUseSuggestion(suggestion.suggestedPrice) }) {
                Text("Use Suggestion")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.buttonPrimary)
            .controlSize(.regular)
            .keyboardShortcut(.return, modifiers: [.command])
            .accessibilityHint("Sets the tag price to the suggested value")
        }
    }
}

// MARK: - Confidence Badge

private struct ConfidenceBadge: View {
    let confidence: PriceSuggestion.Confidence

    var body: some View {
        Text(confidence.rawValue.capitalized)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(backgroundColor)
            .foregroundStyle(foregroundColor)
            .clipShape(Capsule())
    }

    private var backgroundColor: Color {
        switch confidence {
        case .high: return AppTheme.primary.opacity(0.15)
        case .medium: return AppTheme.confidenceMedium.opacity(0.15)
        case .low: return AppTheme.confidenceLow.opacity(0.12)
        }
    }

    private var foregroundColor: Color {
        switch confidence {
        case .high: return AppTheme.primary
        case .medium: return AppTheme.confidenceMedium
        case .low: return AppTheme.confidenceLow
        }
    }
}
