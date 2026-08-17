import Foundation

extension ItemCaptureFormView {
    /// Constructs a title from brand, description, color, pattern, and size.
    /// Format: "Brand Description, Color, Pattern, Size" — omitting empty parts.
    static func constructTitle(brand: String, description: String, color: String, pattern: String, size: String) -> String {
        // First part: brand + description (space-separated)
        let firstParts = [brand, description].filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let first = firstParts.joined(separator: " ")

        // Remaining parts: color, pattern, size (comma-separated)
        let remaining = [color, pattern, size].filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }

        if first.isEmpty && remaining.isEmpty {
            return ""
        }

        if remaining.isEmpty {
            return first
        }

        if first.isEmpty {
            return remaining.joined(separator: ", ")
        }

        return first + ", " + remaining.joined(separator: ", ")
    }
}
