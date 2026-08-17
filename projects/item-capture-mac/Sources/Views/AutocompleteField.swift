import SwiftUI

/// A reusable text field with inline autocomplete suggestions from a list of candidates.
/// Supports prioritized matching: exact > prefix > initials > substring.
/// Initials matching works on word boundaries (spaces, /, &, -).
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
        TextField("", text: $value, prompt: Text(placeholder).foregroundStyle(.tertiary))
            .textFieldStyle(.roundedBorder)
            .focused($isFocused)
            .onChange(of: value) { _, newValue in
                updateSuggestions(for: newValue)
            }
            .onChange(of: isFocused) { _, focused in
                if !focused {
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
                if isShowingSuggestions && !suggestions.isEmpty {
                    let pickIndex = selectedIndex >= 0 ? selectedIndex : 0
                    value = suggestions[pickIndex]
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
            .popover(isPresented: $isShowingSuggestions, attachmentAnchor: .rect(.bounds), arrowEdge: .bottom) {
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

    private func updateSuggestions(for query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 1 else {
            suggestions = []
            isShowingSuggestions = false
            selectedIndex = -1
            return
        }

        let lowered = trimmed.lowercased()

        // Categorize matches by priority
        var exact: [String] = []
        var prefix: [String] = []
        var initials: [String] = []
        var substring: [String] = []

        for candidate in candidates {
            let candidateLower = candidate.lowercased()

            if candidateLower == lowered {
                exact.append(candidate)
            } else if candidateLower.hasPrefix(lowered) {
                prefix.append(candidate)
            } else if matchesInitials(query: trimmed, candidate: candidate) {
                initials.append(candidate)
            } else if candidateLower.contains(lowered) {
                substring.append(candidate)
            }
        }

        let combined = exact + prefix.sorted() + initials.sorted() + substring.sorted()
        suggestions = Array(combined.prefix(maxSuggestions))
        isShowingSuggestions = !suggestions.isEmpty
        selectedIndex = suggestions.isEmpty ? -1 : 0
    }

    /// Matches query characters against the initials of words in the candidate.
    /// Words are split on spaces, /, &, and -.
    /// e.g. "ApW" matches "Apricot/Weiss", "KH" matches "Kurze Hose"
    private func matchesInitials(query: String, candidate: String) -> Bool {
        let separators = CharacterSet(charactersIn: " /&-")
        let words = candidate.components(separatedBy: separators).filter { !$0.isEmpty }

        guard words.count >= 2 else { return false }

        let queryChars = Array(query)
        var queryIndex = 0

        for word in words {
            guard queryIndex < queryChars.count else { break }

            let queryChar = queryChars[queryIndex]
            let wordStart = word.prefix(1)

            // Case-insensitive match on first char, case-sensitive if query char is uppercase
            if queryChar.isUppercase {
                if wordStart == String(queryChar) || wordStart.lowercased() == String(queryChar).lowercased() {
                    queryIndex += 1
                }
            } else {
                if wordStart.lowercased() == String(queryChar).lowercased() {
                    queryIndex += 1
                }
            }
        }

        return queryIndex == queryChars.count
    }
}

/// Dropdown list of autocomplete suggestions displayed in a popover.
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
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(index == selectedIndex ? Color.accentColor.opacity(0.3) : Color.clear)
                        .foregroundStyle(index == selectedIndex ? .primary : .secondary)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Suggestion: \(suggestion)")
            }
        }
        .frame(width: 280)
        .padding(.vertical, 4)
    }
}
