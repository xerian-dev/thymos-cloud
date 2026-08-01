import SwiftUI

/// A reusable text field with inline autocomplete suggestions from a list of candidates.
/// Supports fuzzy matching (prefix-based) and keyboard navigation.
struct AutocompleteField: View {
    let label: String
    let placeholder: String
    let candidates: [String]
    @Binding var value: String

    @State private var suggestions: [String] = []
    @State private var isShowingSuggestions = false
    @State private var selectedIndex: Int = -1
    @FocusState private var isFocused: Bool

    private let maxSuggestions = 8

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            TextField("", text: $value, prompt: Text(placeholder).foregroundStyle(.tertiary))
                .textFieldStyle(.roundedBorder)
                .focused($isFocused)
                .onChange(of: value) { _, newValue in
                    updateSuggestions(for: newValue)
                }
                .onChange(of: isFocused) { _, focused in
                    if !focused {
                        // Delay hiding to allow click on suggestion
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            isShowingSuggestions = false
                        }
                    }
                }
                .onKeyPress(.downArrow) {
                    if isShowingSuggestions && !suggestions.isEmpty {
                        selectedIndex = min(selectedIndex + 1, suggestions.count - 1)
                    }
                    return .handled
                }
                .onKeyPress(.upArrow) {
                    if isShowingSuggestions && selectedIndex > 0 {
                        selectedIndex -= 1
                    }
                    return .handled
                }
                .onKeyPress(.return) {
                    if isShowingSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.count {
                        value = suggestions[selectedIndex]
                        isShowingSuggestions = false
                        selectedIndex = -1
                        return .handled
                    }
                    return .ignored
                }
                .onKeyPress(.escape) {
                    if isShowingSuggestions {
                        isShowingSuggestions = false
                        selectedIndex = -1
                        return .handled
                    }
                    return .ignored
                }
                .accessibilityLabel(label)

            if isShowingSuggestions && !suggestions.isEmpty {
                SuggestionsPopover(
                    suggestions: suggestions,
                    selectedIndex: selectedIndex,
                    onSelect: { selected in
                        value = selected
                        isShowingSuggestions = false
                        selectedIndex = -1
                    }
                )
            }
        }
    }

    private func updateSuggestions(for query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 1 else {
            suggestions = []
            isShowingSuggestions = false
            selectedIndex = -1
            return
        }

        let lowered = trimmed.lowercased()
        let filtered = candidates.filter { candidate in
            candidate.lowercased().contains(lowered)
        }
        .prefix(maxSuggestions)

        suggestions = Array(filtered)
        isShowingSuggestions = !suggestions.isEmpty
        selectedIndex = -1
    }
}

/// Dropdown list of autocomplete suggestions.
private struct SuggestionsPopover: View {
    let suggestions: [String]
    let selectedIndex: Int
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(suggestions.enumerated()), id: \.offset) { index, suggestion in
                Button(action: { onSelect(suggestion) }) {
                    Text(suggestion)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(index == selectedIndex ? Color.accentColor.opacity(0.15) : Color.clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Suggestion: \(suggestion)")
            }
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }
}
