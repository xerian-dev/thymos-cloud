import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload, Play } from "lucide-react";
import { toast } from "sonner";
import type { ColorMapping } from "./colors-types";
import {
  downloadMappings,
  uploadMappings,
  applyMappings,
  fetchApplyStatus,
} from "./colors-api";

export function ColorManagementPage(): React.ReactNode {
  const [lastModified, setLastModified] = React.useState<string | null>(null);
  const [mappingCount, setMappingCount] = React.useState<number>(0);
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
      setMappingCount(result.data.length);
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

    const formatted = JSON.stringify(result.data, null, 2) + "\n";
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "color-mappings.json";
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
      const parsed = JSON.parse(text) as ColorMapping[];

      if (!Array.isArray(parsed)) {
        setError("Invalid file format: expected a JSON array of mappings");
        setIsUploading(false);
        return;
      }

      const validationError = validateColorFile(parsed);
      if (validationError) {
        setError(validationError);
        setIsUploading(false);
        return;
      }

      const result = await uploadMappings(parsed);
      if (result.success) {
        setMappingCount(parsed.length);
        setLastModified(new Date().toISOString());
        setHasUnappliedChanges(true);
        setStatusMessage(null);
        toast.success(`Uploaded ${parsed.length} color mappings`);
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
        <h1 className="text-2xl font-bold tracking-tight">Color Management</h1>
        <p className="text-sm text-muted-foreground">
          {mappingCount > 0 && `${mappingCount} mappings`}
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
            Download the current color mappings file for editing.
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
            Upload an edited color mappings file to replace the current draft.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelected}
            aria-label="Upload color mappings file"
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
          The JSON file is a flat array of color mappings. Each entry maps a raw
          value to a canonical color name and optionally a pattern name.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
          {`[
  { "raw": "blau gestreift", "canonical": "Blau", "pattern": "Gestreift" },
  { "raw": "dunkelblau", "canonical": "Blau", "pattern": null },
  { "raw": "rot", "canonical": "Rot", "pattern": null }
]`}
        </pre>
      </div>
    </div>
  );
}

function validateColorFile(data: unknown[]): string | null {
  for (let i = 0; i < data.length; i++) {
    const entry = data[i] as Record<string, unknown>;
    if (typeof entry !== "object" || entry === null) {
      return `Entry ${i} is not an object`;
    }
    if (!("raw" in entry) || typeof entry.raw !== "string") {
      return `Entry ${i} is missing "raw" string field`;
    }
    if (
      !("canonical" in entry) ||
      (entry.canonical !== null && typeof entry.canonical !== "string")
    ) {
      return `Entry ${i} ("${entry.raw}"): "canonical" must be a string or null`;
    }
    if (
      !("pattern" in entry) ||
      (entry.pattern !== null && typeof entry.pattern !== "string")
    ) {
      return `Entry ${i} ("${entry.raw}"): "pattern" must be a string or null`;
    }
  }
  return null;
}
