import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Play, Save, Upload } from "lucide-react";
import type { DescriptionMapping } from "./descriptions-types";
import {
  triggerScanCluster,
  fetchMappings,
  saveMappings,
  applyMappings,
  fetchApplyStatus,
} from "./descriptions-api";

const ROW_HEIGHT = 44;

export function DescriptionManagementPage(): React.ReactNode {
  const [mappings, setMappings] = React.useState<DescriptionMapping[]>([]);
  const [lastModified, setLastModified] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [isClustering, setIsClustering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const parentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    loadMappings();
  }, []);

  const filteredMappings = React.useMemo(() => {
    if (!searchTerm.trim()) return mappings;
    const term = searchTerm.toLowerCase();
    return mappings.filter(
      (m) =>
        m.raw.toLowerCase().includes(term) ||
        m.canonical.toLowerCase().includes(term),
    );
  }, [mappings, searchTerm]);

  const virtualizer = useVirtualizer({
    count: filteredMappings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  async function loadMappings(): Promise<void> {
    setIsLoading(true);
    setError(null);
    const result = await fetchMappings();
    if (result.success) {
      setMappings(result.data.mappings);
      setLastModified(result.data.lastModified);
      setHasUnsavedChanges(false);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }

  async function handleScanCluster(): Promise<void> {
    setIsClustering(true);
    setError(null);
    setStatusMessage("Scan & cluster started. This may take several minutes...");
    const result = await triggerScanCluster();
    if (!result.success) {
      setError(result.error ?? "Failed to start scan & cluster");
      setStatusMessage(null);
    } else {
      setStatusMessage(
        "Scan & cluster running in background. Refresh mappings in a few minutes.",
      );
    }
    setIsClustering(false);
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setError(null);
    const result = await saveMappings(mappings);
    if (result.success) {
      setStatusMessage("Draft saved");
      setHasUnsavedChanges(false);
    } else {
      setError(result.error ?? "Failed to save");
    }
    setIsSaving(false);
  }

  async function handleApply(): Promise<void> {
    if (hasUnsavedChanges) {
      setError("Save your changes before applying");
      return;
    }

    setIsApplying(true);
    setError(null);
    setStatusMessage("Applying mappings... This runs in the background.");
    const result = await applyMappings();
    if (!result.success) {
      setError(result.error ?? "Failed to start apply");
      setStatusMessage(null);
      setIsApplying(false);
      return;
    }

    setStatusMessage("Apply running in background. Polling for status...");
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
        setStatusMessage(
          `Apply complete: ${data.itemsUpdated ?? 0} items updated, ${data.canonicalDescriptionsSeeded ?? 0} canonical descriptions seeded. ${data.errors ?? 0} errors.`,
        );
      } else if (data.status === "error") {
        clearInterval(interval);
        setIsApplying(false);
        setError(data.message ?? "Apply failed");
        setStatusMessage(null);
      }
    }, 5000);
  }

  function handleMappingChange(filteredIndex: number, canonical: string): void {
    const mapping = filteredMappings[filteredIndex];
    const realIndex = mappings.indexOf(mapping);
    if (realIndex === -1) return;

    setMappings((prev) => {
      const updated = [...prev];
      updated[realIndex] = { ...updated[realIndex], canonical };
      return updated;
    });
    setHasUnsavedChanges(true);
  }

  function handleDeleteMapping(filteredIndex: number): void {
    const mapping = filteredMappings[filteredIndex];
    const realIndex = mappings.indexOf(mapping);
    if (realIndex === -1) return;

    setMappings((prev) => prev.filter((_, i) => i !== realIndex));
    setHasUnsavedChanges(true);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Description Management</h1>
          <p className="text-sm text-muted-foreground">
            {mappings.length} mappings
            {lastModified && ` · Last updated ${new Date(lastModified).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScanCluster}
            disabled={isClustering}
          >
            {isClustering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Scan & Cluster
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMappings}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isApplying || hasUnsavedChanges}
          >
            {isApplying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Apply
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {statusMessage && !error && (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search descriptions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          aria-label="Search description mappings"
        />
        {searchTerm && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {filteredMappings.length} results
          </span>
        )}
      </div>

      {isLoading && mappings.length === 0 ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden rounded-md border">
          <div className="flex border-b bg-muted/50 px-4 py-2 text-sm font-medium">
            <div className="w-1/3">Raw Value</div>
            <div className="flex-1">Canonical</div>
            <div className="w-12" />
          </div>

          <div
            ref={parentRef}
            className="h-[calc(100vh-320px)] overflow-auto"
            role="grid"
            aria-label="Description mappings"
            aria-rowcount={filteredMappings.length}
          >
            {filteredMappings.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                {searchTerm ? "No mappings match your search" : "No mappings loaded"}
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const mapping = filteredMappings[virtualRow.index];
                  return (
                    <div
                      key={mapping.raw}
                      className="absolute left-0 top-0 flex w-full items-center border-b px-4"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      role="row"
                      aria-rowindex={virtualRow.index + 1}
                    >
                      <div className="w-1/3 truncate pr-4 font-mono text-xs">
                        {mapping.raw}
                      </div>
                      <div className="flex-1 pr-2">
                        <Input
                          value={mapping.canonical}
                          onChange={(e) =>
                            handleMappingChange(virtualRow.index, e.target.value)
                          }
                          className="h-8 text-sm"
                          aria-label={`Canonical name for ${mapping.raw}`}
                        />
                      </div>
                      <div className="w-12 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMapping(virtualRow.index)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove mapping for ${mapping.raw}`}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing {filteredMappings.length} of {mappings.length} mappings
          </div>
        </div>
      )}
    </div>
  );
}
