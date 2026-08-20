import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Upload, Play } from "lucide-react";
import { toast } from "sonner";
import { fetchAuthSession } from "aws-amplify/auth";
import { API_BASE } from "@/config/api-config";
import { triggerAggregation } from "./pricing-api";

interface MappingFileState {
  lastModified: string | null;
  count: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Fall through
  }
  return {};
}

async function fetchMappingFile(
  endpoint: string,
): Promise<
  | { success: true; data: unknown[]; lastModified: string | null }
  | { success: false; error: string }
> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/${endpoint}/mappings`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      data: data.mappings as unknown[],
      lastModified: data.lastModified ?? null,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function uploadMappingFile(
  endpoint: string,
  mappings: unknown[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/${endpoint}/mappings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mappings }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function PricingDataPage(): React.ReactNode {
  const [brands, setBrands] = React.useState<MappingFileState>({
    lastModified: null,
    count: 0,
  });
  const [colors, setColors] = React.useState<MappingFileState>({
    lastModified: null,
    count: 0,
  });
  const [descriptions, setDescriptions] = React.useState<MappingFileState>({
    lastModified: null,
    count: 0,
  });

  const [isAggregating, setIsAggregating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const brandFileRef = React.useRef<HTMLInputElement>(null);
  const colorFileRef = React.useRef<HTMLInputElement>(null);
  const descFileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    loadAllMetadata();
  }, []);

  async function loadAllMetadata(): Promise<void> {
    const [brandResult, colorResult, descResult] = await Promise.all([
      fetchMappingFile("brands"),
      fetchMappingFile("colors"),
      fetchMappingFile("descriptions"),
    ]);

    if (brandResult.success) {
      setBrands({
        lastModified: brandResult.lastModified,
        count: brandResult.data.length,
      });
    }
    if (colorResult.success) {
      setColors({
        lastModified: colorResult.lastModified,
        count: colorResult.data.length,
      });
    }
    if (descResult.success) {
      setDescriptions({
        lastModified: descResult.lastModified,
        count: descResult.data.length,
      });
    }
  }

  async function handleDownload(
    endpoint: string,
    filename: string,
  ): Promise<void> {
    setError(null);
    const result = await fetchMappingFile(endpoint);
    if (!result.success) {
      setError(result.error);
      return;
    }

    const formatted = JSON.stringify(result.data, null, 2) + "\n";
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(
    endpoint: string,
    file: File,
    label: string,
  ): Promise<void> {
    setError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown[];

      if (!Array.isArray(parsed)) {
        setError(`${label}: expected a JSON array`);
        return;
      }

      const result = await uploadMappingFile(endpoint, parsed);
      if (result.success) {
        toast.success(`${label}: uploaded ${parsed.length} entries`);
        loadAllMetadata();
      } else {
        setError(result.error ?? `${label}: upload failed`);
      }
    } catch {
      setError(`${label}: failed to parse file. Ensure it is valid JSON.`);
    }
  }

  function handleFileChange(
    endpoint: string,
    label: string,
    ref: React.RefObject<HTMLInputElement | null>,
  ) {
    return async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await handleUpload(endpoint, file, label);
      if (ref.current) {
        ref.current.value = "";
      }
    };
  }

  async function handleAggregate(): Promise<void> {
    setIsAggregating(true);
    setError(null);

    const result = await triggerAggregation();
    if (result.success) {
      toast.success(
        "Pricing aggregation triggered. This runs in the background and may take several minutes.",
      );
    } else {
      setError("Failed to trigger aggregation");
    }

    setIsAggregating(false);
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pricing Data</h1>
        <p className="text-sm text-muted-foreground">
          Manage the mapping files used by the pricing aggregator to normalize
          item data into pricing groups.
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

      {/* Mapping Files */}
      <div className="flex flex-col gap-4">
        <MappingCard
          title="Brand Mappings"
          description="Maps raw brand values to canonical brand names, grouped by category."
          count={brands.count}
          countLabel="brands"
          lastModified={brands.lastModified}
          onDownload={() => handleDownload("brands", "brand-mappings.json")}
          onUploadClick={() => brandFileRef.current?.click()}
        />
        <input
          ref={brandFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange("brands", "Brand mappings", brandFileRef)}
          aria-label="Upload brand mappings file"
        />

        <MappingCard
          title="Description Mappings"
          description="Maps raw description values to canonical descriptions, grouped by category."
          count={descriptions.count}
          countLabel="descriptions"
          lastModified={descriptions.lastModified}
          onDownload={() =>
            handleDownload("descriptions", "description-mappings.json")
          }
          onUploadClick={() => descFileRef.current?.click()}
        />
        <input
          ref={descFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange(
            "descriptions",
            "Description mappings",
            descFileRef,
          )}
          aria-label="Upload description mappings file"
        />

        <MappingCard
          title="Color Mappings"
          description="Maps raw color values to canonical colors and patterns."
          count={colors.count}
          countLabel="mappings"
          lastModified={colors.lastModified}
          onDownload={() => handleDownload("colors", "color-mappings.json")}
          onUploadClick={() => colorFileRef.current?.click()}
        />
        <input
          ref={colorFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange("colors", "Color mappings", colorFileRef)}
          aria-label="Upload color mappings file"
        />
      </div>

      {/* Aggregate */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Run Pricing Aggregation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Triggers the pricing aggregator to recompute all pricing references
              using the current mapping files. Runs automatically every Sunday at
              02:00 UTC.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleAggregate}
            disabled={isAggregating}
          >
            {isAggregating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Aggregate Now
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MappingCardProps {
  title: string;
  description: string;
  count: number;
  countLabel: string;
  lastModified: string | null;
  onDownload: () => void;
  onUploadClick: () => void;
}

function MappingCard({
  title,
  description,
  count,
  countLabel,
  lastModified,
  onDownload,
  onUploadClick,
}: MappingCardProps): React.ReactNode {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {count > 0 && `${count} ${countLabel}`}
            {lastModified &&
              ` · Last updated ${new Date(lastModified).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" size="sm" onClick={onUploadClick}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}
