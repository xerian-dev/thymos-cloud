import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Play, Save, Upload } from "lucide-react";
import type { BrandMapping } from "./brands-types";
import {
  triggerScanCluster,
  fetchMappings,
  saveMappings,
  applyMappings,
} from "./brands-api";

export function BrandManagementPage(): React.ReactNode {
  const [mappings, setMappings] = React.useState<BrandMapping[]>([]);
  const [lastModified, setLastModified] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [isClustering, setIsClustering] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Load mappings on mount
  React.useEffect(() => {
    loadMappings();
  }, []);

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
    setStatusMessage(
      "Scan & cluster started. This may take several minutes...",
    );
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
    setStatusMessage(
      "Applying mappings... This may take a while for large deltas.",
    );
    const result = await applyMappings();
    if (result.success) {
      setStatusMessage(
        `Applied: ${result.data.itemsUpdated} items updated, ${result.data.canonicalBrandsSeeded} canonical brands seeded. ${result.data.errors} errors.`,
      );
    } else {
      setError(result.error);
      setStatusMessage(null);
    }
    setIsApplying(false);
  }

  function handleMappingChange(index: number, canonical: string): void {
    setMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], canonical };
      return updated;
    });
    setHasUnsavedChanges(true);
  }

  function handleDeleteMapping(index: number): void {
    setMappings((prev) => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  }

  // Filter mappings by search term
  const filteredMappings = React.useMemo(() => {
    if (!searchTerm.trim()) return mappings;
    const term = searchTerm.toLowerCase();
    return mappings.filter(
      (m) =>
        m.raw.toLowerCase().includes(term) ||
        m.canonical.toLowerCase().includes(term),
    );
  }, [mappings, searchTerm]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Brand Management
          </h1>
          <p className="text-sm text-muted-foreground">
            {mappings.length} mappings
            {lastModified &&
              ` · Last updated ${new Date(lastModified).toLocaleString()}`}
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search brands..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          aria-label="Search brand mappings"
        />
      </div>

      {/* Mapping table */}
      {isLoading && mappings.length === 0 ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border">
          <table
            className="w-full text-sm"
            role="grid"
            aria-label="Brand mappings"
          >
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Raw Value</th>
                <th className="px-4 py-3 text-left font-medium">Canonical</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredMappings.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {searchTerm
                      ? "No mappings match your search"
                      : "No mappings loaded"}
                  </td>
                </tr>
              ) : (
                filteredMappings.map((mapping) => {
                  const realIndex = mappings.indexOf(mapping);
                  return (
                    <tr key={mapping.raw} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">
                        {mapping.raw}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={mapping.canonical}
                          onChange={(e) =>
                            handleMappingChange(realIndex, e.target.value)
                          }
                          className="h-8 text-sm"
                          aria-label={`Canonical name for ${mapping.raw}`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMapping(realIndex)}
                          className="h-8 text-xs text-muted-foreground hover:text-destructive"
                          aria-label={`Remove mapping for ${mapping.raw}`}
                        >
                          ×
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {filteredMappings.length > 0 && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Showing {filteredMappings.length} of {mappings.length} mappings
            </div>
          )}
        </div>
      )}
    </div>
  );
}
