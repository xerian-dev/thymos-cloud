import SwiftUI
import SwiftData

/// The main item capture form with autocomplete fields for brand, category,
/// color, and description, plus standard inputs for size, title, and tag price.
struct ItemCaptureFormView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(filter: #Predicate<CanonicalValue> { $0.kind == "brand" },
           sort: \CanonicalValue.value)
    private var brandRecords: [CanonicalValue]

    @Query(filter: #Predicate<CanonicalValue> { $0.kind == "color" },
           sort: \CanonicalValue.value)
    private var colorRecords: [CanonicalValue]

    @Query(filter: #Predicate<CanonicalValue> { $0.kind == "pattern" },
           sort: \CanonicalValue.value)
    private var patternRecords: [CanonicalValue]

    @Query(filter: #Predicate<CanonicalValue> { $0.kind == "description" },
           sort: \CanonicalValue.value)
    private var descriptionRecords: [CanonicalValue]

    @Query(sort: \Category.name)
    private var categories: [Category]

    @State private var brand = ""
    @State private var categoryId = ""
    @State private var description = ""
    @State private var color = ""
    @State private var pattern = ""
    @State private var size = ""
    @State private var title = ""
    @State private var titleManuallyEdited = false
    @State private var tagPrice = ""
    @State private var printOnSave = true
    @State private var comment = ""
    @FocusState private var titleFieldFocused: Bool

    let onPriceFieldsChanged: (_ brand: String, _ categoryId: String, _ description: String, _ color: String, _ pattern: String, _ size: String) -> Void
    let onSave: (_ payload: [String: Any], _ printLabel: Bool) -> Void

    var body: some View {
        VStack(spacing: 0) {
        Form {
            Section("Item Details") {
                LabeledContent("Category") {
                    Picker("", selection: $categoryId) {
                        Text("Select a category").tag("")
                        ForEach(categories, id: \.id) { category in
                            Text(category.name).tag(category.id)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 300, alignment: .trailing)
                }

                LabeledContent("Description") {
                    AutocompleteField(
                        label: "Description",
                        placeholder: "Item description",
                        candidates: descriptionRecords.map(\.value),
                        value: $description
                    )
                    .frame(maxWidth: 300)
                }

                LabeledContent("Color") {
                    AutocompleteField(
                        label: "Color",
                        placeholder: "Color",
                        candidates: colorRecords.map(\.value),
                        value: $color
                    )
                    .frame(maxWidth: 300)
                }

                LabeledContent("Pattern") {
                    AutocompleteField(
                        label: "Pattern",
                        placeholder: "Pattern",
                        candidates: patternRecords.map(\.value),
                        value: $pattern
                    )
                    .frame(maxWidth: 300)
                }

                LabeledContent("Brand") {
                    AutocompleteField(
                        label: "Brand",
                        placeholder: "Enter brand name",
                        candidates: brandRecords.map(\.value),
                        value: $brand
                    )
                    .frame(maxWidth: 300)
                }

                LabeledContent("Size") {
                    TextField("", text: $size, prompt: Text("Size").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 300)
                        .accessibilityLabel("Size")
                }

                LabeledContent("Title") {
                    TextField("", text: $title, prompt: Text("Item title").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 300)
                        .accessibilityLabel("Title")
                        .focused($titleFieldFocused)
                        .onChange(of: title) { _, _ in
                            if titleFieldFocused { titleManuallyEdited = true }
                        }
                }
            }

            Section("Pricing") {
                LabeledContent("Tag Price") {
                    HStack(spacing: 4) {
                        Text("CHF")
                            .foregroundStyle(AppTheme.darkAccent)
                            .font(.body.bold().monospacedDigit())
                        TextField("", text: $tagPrice, prompt: Text("0.00").foregroundStyle(.tertiary))
                            .textFieldStyle(.roundedBorder)
                            .font(.title3.monospacedDigit())
                            .frame(maxWidth: 120)
                            .accessibilityLabel("Tag price in CHF")
                            .onChange(of: tagPrice) { _, newValue in
                                let filtered = newValue.filter { $0.isNumber || $0 == "." }
                                if filtered != newValue {
                                    tagPrice = filtered
                                }
                            }
                    }
                }
            }

            Section {
                HStack(spacing: 16) {
                    Toggle("Print On Save", isOn: $printOnSave)
                        .toggleStyle(.checkbox)
                        .tint(AppTheme.primary)

                    Spacer()

                    Button(action: saveItem) {
                        Text("Save")
                            .frame(minWidth: 80)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.buttonPrimary)
                    .controlSize(.large)
                    .keyboardShortcut("s", modifiers: .command)
                }
            }
        }
        .formStyle(.grouped)

        // Comment field — spans full form width
        TextField("", text: $comment, prompt: Text("Comment").foregroundStyle(.tertiary), axis: .vertical)
            .textFieldStyle(.roundedBorder)
            .lineLimit(4...8)
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .accessibilityLabel("Comment")
        } // VStack
        .onChange(of: brand) { _, _ in notifyPriceFields() }
        .onChange(of: categoryId) { _, _ in notifyPriceFields() }
        .onChange(of: description) { _, _ in notifyPriceFields() }
        .onChange(of: color) { _, _ in notifyPriceFields() }
        .onChange(of: pattern) { _, _ in notifyPriceFields() }
        .onChange(of: size) { _, _ in notifyPriceFields() }
    }

    /// Accept a suggested price from the pricing panel.
    func useSuggestion(_ price: Double) {
        tagPrice = String(format: "%.2f", price)
    }

    private func saveItem() {
        var payload: [String: Any] = [
            "title": title,
            "brand": brand,
            "categoryId": categoryId,
            "description": description,
            "color": color,
            "size": size,
            "tagPrice": Double(tagPrice) ?? 0.0
        ]

        if !pattern.isEmpty {
            payload["pattern"] = pattern
        }

        if !comment.isEmpty {
            payload["comment"] = comment
        }

        onSave(payload, printOnSave)
    }

    private func updateTitleIfNeeded() {
        guard !titleManuallyEdited else { return }
        title = Self.constructTitle(brand: brand, description: description, color: color, pattern: pattern, size: size)
    }

    private func notifyPriceFields() {
        updateTitleIfNeeded()
        onPriceFieldsChanged(brand, categoryId, description, color, pattern, size)
    }
}
