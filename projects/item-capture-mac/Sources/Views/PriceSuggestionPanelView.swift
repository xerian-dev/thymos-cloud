import SwiftUI

/// Side panel displaying the computed price suggestion from the local pricing engine.
/// Shows suggested price, confidence badge, explanation, and a "Use Suggestion" button.
struct PriceSuggestionPanelView: View {
    let suggestion: PriceSuggestion?
    let isLoading: Bool
    let onUseSuggestion: (Double) -> Void

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text("Price Suggestion")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                if isLoading {
                    loadingView
                } else if let suggestion {
                    suggestionView(suggestion)
                } else {
                    emptyView
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Price suggestion panel")
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(alignment: .leading, spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text("Calculating...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var emptyView: some View {
        Text("Enter item details to see a price suggestion")
            .font(.callout)
            .foregroundStyle(.tertiary)
    }

    private func suggestionView(_ suggestion: PriceSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Price + confidence badge
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("CHF \(suggestion.suggestedPrice, specifier: "%.2f")")
                    .font(.title2.bold().monospacedDigit())

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
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(backgroundColor)
            .foregroundStyle(foregroundColor)
            .clipShape(Capsule())
    }

    private var backgroundColor: Color {
        switch confidence {
        case .high: return .green.opacity(0.15)
        case .medium: return .orange.opacity(0.15)
        case .low: return .gray.opacity(0.15)
        }
    }

    private var foregroundColor: Color {
        switch confidence {
        case .high: return .green
        case .medium: return .orange
        case .low: return .secondary
        }
    }
}
