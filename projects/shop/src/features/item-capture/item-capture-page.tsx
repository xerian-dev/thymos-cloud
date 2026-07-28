import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandAutocomplete } from "./brand-autocomplete";
import { CategoryAutocomplete } from "./category-autocomplete";
import { ColorAutocomplete } from "./color-autocomplete";
import { PriceSuggestionPanel } from "./price-suggestion-panel";

export function ItemCapturePage(): React.ReactNode {
  const [brand, setBrand] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [color, setColor] = React.useState("");
  const [size, setSize] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [tagPrice, setTagPrice] = React.useState("");

  function handleUseSuggestion(price: number): void {
    setTagPrice(price.toFixed(2));
  }

  function handleTagPriceChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value;
    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
      setTagPrice(raw);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Preview Mode Banner */}
      <div
        role="alert"
        className="mb-6 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
      >
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold">
          Preview Mode — items will not be created
        </span>
      </div>

      {/* Two-column layout on desktop, single column on mobile */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Left column: item fields */}
        <form
          aria-label="Item capture form"
          onSubmit={(e) => e.preventDefault()}
          className="space-y-5"
        >
          {/* Brand */}
          <div className="space-y-1.5">
            <Label htmlFor="brand-field">Brand</Label>
            <BrandAutocomplete value={brand} onChange={setBrand} />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category-field">Category</Label>
            <CategoryAutocomplete value={categoryId} onChange={setCategoryId} />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label htmlFor="color-field">Color</Label>
            <ColorAutocomplete value={color} onChange={setColor} />
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <Label htmlFor="size-field">Size</Label>
            <Input
              id="size-field"
              type="text"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Size"
              aria-label="Size"
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title-field">Title</Label>
            <Input
              id="title-field"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              aria-label="Title"
            />
          </div>

          {/* Tag Price with CHF prefix */}
          <div className="space-y-1.5">
            <Label htmlFor="tag-price-field">Tag Price</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                CHF
              </span>
              <Input
                id="tag-price-field"
                type="text"
                inputMode="decimal"
                value={tagPrice}
                onChange={handleTagPriceChange}
                placeholder="0.00"
                aria-label="Tag price in CHF"
                className="max-w-40"
              />
            </div>
          </div>
        </form>

        {/* Right column: PriceSuggestionPanel (sticky on scroll) */}
        <aside
          className="lg:sticky lg:top-6 lg:self-start"
          aria-label="Price suggestion"
        >
          <PriceSuggestionPanel
            brand={brand}
            categoryId={categoryId}
            color={color}
            size={size}
            onUseSuggestion={handleUseSuggestion}
          />
        </aside>
      </div>
    </div>
  );
}
