import * as React from "react";
import { cn } from "@/lib/utils";

export interface AutocompleteInputProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  filterFn?: (item: string, query: string) => boolean;
  placeholder?: string;
  "aria-label": string;
  disabled?: boolean;
  className?: string;
}

function defaultFilterFn(item: string, query: string): boolean {
  return item.toLowerCase().startsWith(query.toLowerCase());
}

export function AutocompleteInput({
  items,
  value,
  onChange,
  onSelect,
  filterFn = defaultFilterFn,
  placeholder,
  "aria-label": ariaLabel,
  disabled = false,
  className,
}: AutocompleteInputProps): React.ReactNode {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredItems = React.useMemo(() => {
    if (!value.trim()) return [];
    return items.filter((item) => filterFn(item, value));
  }, [items, value, filterFn]);

  const showDropdown = isOpen && filteredItems.length > 0;

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [filteredItems]);

  React.useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[activeIndex] as
        | HTMLElement
        | undefined;
      if (activeElement && typeof activeElement.scrollIntoView === "function") {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onChange(e.target.value);
    setIsOpen(true);
  }

  function handleSelect(item: string): void {
    onChange(item);
    onSelect?.(item);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!showDropdown) {
      if (e.key === "ArrowDown" && filteredItems.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredItems.length) {
          handleSelect(filteredItems[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function handleFocus(): void {
    if (value.trim() && filteredItems.length > 0) {
      setIsOpen(true);
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>): void {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  const listboxId = React.useId();

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onBlur={handleBlur}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        role="combobox"
        disabled={disabled}
        className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover p-1 shadow-md"
        >
          {filteredItems.map((item, index) => (
            <li
              key={item}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none select-none",
                index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
