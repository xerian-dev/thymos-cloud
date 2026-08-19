import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload, Play } from "lucide-react";
import { toast } from "sonner";
import type { BrandCategory } from "./brands-types";
import {
  downloadMappings,
  uploadMappings,
  applyMappings,
  fetchApplyStatus,
} from "./brands-api";

export function BrandManagementPage(): React.ReactNode {
  const [lastModified, setLastModified] = React.useState<string | null>(null);
  const [brandCount, setBrandCount] = React.useState<number>(0);
  const [categoryCount, setCategoryCount] = React.useState<number>(0);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [hasUnappliedChanges, setHasUnappliedChanges] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    loadMetadata();
  }, []);

  async function loadMetadata(): Promise<void> {
    const result = await downloadMappings();
    if (result.success) {
      setLastModified(result.lastModified);
      if (Array.isArray(result.data) && result.data.length > 0) {
        const first = result.data[0] as Record<string, unknown>;
        if ("categoryName" in first && "brands" in first) {
          // New grouped format
          const totalBrands = result.data.reduce(
            (sum, cat) => sum + cat.brands.length,
            0,
          );
          setBrandCount(totalBrands);
          setCategoryCount(
            result.data.filter((c) => c.brands.length > 0).length,
          );
        } else {
          // Old flat format — just show count
          setBrandCount(result.data.length);
          setCategoryCount(0);
        }
      }
    }
  }

  async function handleDownload(): Promise<void> {
    setIsDownloading(true);
    setError(null);

    const result = await downloadMappings();
    if (!result.success) {
      setError(result.error);
      setIsDownloading(false);
      return;
    }

    // Handle both old flat format and new grouped format
    let categories: BrandCategory[];
    if (
      Array.isArray(result.data) &&
      result.data.length > 0 &&
      "categoryName" in (result.data[0] as Record<string, unknown>)
    ) {
      categories = result.data;
    } else {
      // Old flat format — convert to grouped for download
      categories = flatToGrouped(
        result.data as unknown as { raw: string; canonical: string | null }[],
      );
    }

    const formatted = formatBrandFile(categories);
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brand-mappings.json";
    link.click();
    URL.revokeObjectURL(url);

    setIsDownloading(false);
  }

  function handleUploadClick(): void {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BrandCategory[];

      if (!Array.isArray(parsed)) {
        setError("Invalid file format: expected a JSON array of categories");
        setIsUploading(false);
        return;
      }

      const validationError = validateBrandFile(parsed);
      if (validationError) {
        setError(validationError);
        setIsUploading(false);
        return;
      }

      const result = await uploadMappings(parsed);
      if (result.success) {
        const totalBrands = parsed.reduce(
          (sum, cat) => sum + cat.brands.length,
          0,
        );
        setBrandCount(totalBrands);
        setCategoryCount(parsed.filter((c) => c.brands.length > 0).length);
        setLastModified(new Date().toISOString());
        setHasUnappliedChanges(true);
        setStatusMessage(null);
        toast.success(
          `Uploaded ${totalBrands} brands across ${parsed.length} categories`,
        );
      } else {
        setError(result.error ?? "Upload failed");
      }
    } catch {
      setError("Failed to parse file. Ensure it is valid JSON.");
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleApply(): Promise<void> {
    setIsApplying(true);
    setError(null);
    setStatusMessage("Applying mappings to items...");

    const result = await applyMappings();
    if (!result.success) {
      setError(result.error ?? "Failed to start apply");
      setStatusMessage(null);
      setIsApplying(false);
      return;
    }

    pollApplyStatus();
  }

  function pollApplyStatus(): void {
    const interval = setInterval(async () => {
      const result = await fetchApplyStatus();
      if (!result.success) return;

      const { data } = result;

      if (data.status === "complete") {
        clearInterval(interval);
        setIsApplying(false);
        setHasUnappliedChanges(false);
        setStatusMessage(null);
        toast.success(
          `Apply complete: ${data.itemsUpdated ?? 0} items updated, ${data.errors ?? 0} errors`,
        );
      } else if (data.status === "error") {
        clearInterval(interval);
        setIsApplying(false);
        setError(data.message ?? "Apply failed");
        setStatusMessage(null);
      }
    }, 5000);
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brand Management</h1>
        <p className="text-sm text-muted-foreground">
          {brandCount > 0 &&
            categoryCount > 0 &&
            `${brandCount} brands in ${categoryCount} categories`}
          {brandCount > 0 && categoryCount === 0 && `${brandCount} mappings`}
          {lastModified &&
            ` · Last updated ${new Date(lastModified).toLocaleString()}`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Status */}
      {statusMessage && !error && (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-1">
          <h2 className="text-sm font-medium">Download</h2>
          <p className="text-sm text-muted-foreground">
            Download the current brand mappings file for editing.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-fit"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download JSON
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-1">
          <h2 className="text-sm font-medium">Upload</h2>
          <p className="text-sm text-muted-foreground">
            Upload an edited brand mappings file to replace the current draft.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelected}
            aria-label="Upload brand mappings file"
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-fit"
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload JSON
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-1">
          <h2 className="text-sm font-medium">Apply</h2>
          <p className="text-sm text-muted-foreground">
            Apply the uploaded draft to all items in the database.
          </p>
          <Button
            size="sm"
            className="mt-2 w-fit"
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Apply
          </Button>
          {hasUnappliedChanges && (
            <p className="text-xs text-amber-600">
              Draft has unapplied changes
            </p>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h2 className="text-sm font-medium">File Format</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The JSON file is organized by category. Each brand has a canonical
          name and a list of aliases (variant spellings that map to it). The
          first alias should always be the canonical name itself.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
          {`[
  {
    "categoryId": "...",
    "categoryName": "Schuhe",
    "brands": [
      { "canonical": "Nike", "aliases": ["Nike", "nike", "NIKE", "Nke"] },
      { "canonical": "Adidas", "aliases": ["Adidas", "adidas", "Addidas"] }
    ]
  }
]`}
        </pre>
      </div>
    </div>
  );
}

/**
 * Convert old flat format [{raw, canonical}] to grouped format for download.
 */
function flatToGrouped(
  flat: { raw: string; canonical: string | null }[],
): BrandCategory[] {
  const canonicalMap = new Map<string, string[]>();

  for (const entry of flat) {
    const canonical = entry.canonical ?? entry.raw;
    if (!canonicalMap.has(canonical)) {
      canonicalMap.set(canonical, []);
    }
    canonicalMap.get(canonical)!.push(entry.raw);
  }

  const brands = [...canonicalMap.entries()]
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([canonical, aliases]) => ({
      canonical,
      aliases: [
        canonical,
        ...aliases
          .filter((a) => a !== canonical)
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      ],
    }));

  return [
    {
      categoryId: null,
      categoryName: "All Brands",
      brands,
    },
  ];
}

function validateBrandFile(data: unknown[]): string | null {
  for (let i = 0; i < data.length; i++) {
    const cat = data[i] as Record<string, unknown>;
    if (typeof cat !== "object" || cat === null) {
      return `Entry ${i} is not an object`;
    }
    if (!("categoryName" in cat) || typeof cat.categoryName !== "string") {
      return `Entry ${i} is missing categoryName`;
    }
    if (!("brands" in cat) || !Array.isArray(cat.brands)) {
      return `Entry ${i} is missing brands array`;
    }
    for (let j = 0; j < (cat.brands as unknown[]).length; j++) {
      const brand = (cat.brands as unknown[])[j] as Record<string, unknown>;
      if (typeof brand !== "object" || brand === null) {
        return `${cat.categoryName}: brand ${j} is not an object`;
      }
      if (!("canonical" in brand) || typeof brand.canonical !== "string") {
        return `${cat.categoryName}: brand ${j} is missing canonical`;
      }
      if (!("aliases" in brand) || !Array.isArray(brand.aliases)) {
        return `${cat.categoryName}: brand "${brand.canonical}" is missing aliases array`;
      }
    }
  }
  return null;
}

function formatBrandFile(categories: BrandCategory[]): string {
  const lines: string[] = [];
  lines.push("[");

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    lines.push("  {");
    lines.push(`    "categoryId": ${JSON.stringify(cat.categoryId)},`);
    lines.push(`    "categoryName": ${JSON.stringify(cat.categoryName)},`);
    lines.push('    "brands": [');

    for (let j = 0; j < cat.brands.length; j++) {
      const brand = cat.brands[j];
      const aliasesStr = JSON.stringify(brand.aliases);
      const comma = j < cat.brands.length - 1 ? "," : "";
      lines.push(
        `      { "canonical": ${JSON.stringify(brand.canonical)}, "aliases": ${aliasesStr} }${comma}`,
      );
    }

    lines.push("    ]");
    const catComma = i < categories.length - 1 ? "," : "";
    lines.push(`  }${catComma}`);
  }

  lines.push("]");
  return lines.join("\n") + "\n";
}
