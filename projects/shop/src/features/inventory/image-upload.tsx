import { useState, useRef, useCallback } from "react";
import { Upload, X, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPresignedUrl } from "./items-api";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_IMAGES = 10;

type UploadStatus = "uploading" | "success" | "error";

interface UploadingImage {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  s3Key: string | null;
  errorMessage: string | null;
}

export interface ImageUploadProps {
  value: string[];
  onChange: (keys: string[]) => void;
  maxImages?: number;
}

export function ImageUpload({
  value,
  onChange,
  maxImages = DEFAULT_MAX_IMAGES,
}: ImageUploadProps): React.ReactNode {
  const [uploads, setUploads] = useState<UploadingImage[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalImages =
    value.length + uploads.filter((u) => u.status === "uploading").length;

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      setBatchError(null);

      const fileArray = Array.from(files);

      // Check if adding these files would exceed the max
      const currentCount =
        value.length + uploads.filter((u) => u.status === "uploading").length;
      if (currentCount + fileArray.length > maxImages) {
        setBatchError(`Maximum ${maxImages} images per item`);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Validate each file, collect valid ones and errors
      const validFiles: File[] = [];
      const fileErrors: string[] = [];

      for (const file of fileArray) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          fileErrors.push(
            `"${file.name}": Unsupported format. Use JPEG, PNG, or WebP`,
          );
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          fileErrors.push(`"${file.name}": File exceeds 5 MB limit`);
          continue;
        }
        validFiles.push(file);
      }

      if (fileErrors.length > 0) {
        setBatchError(fileErrors.join(". "));
      }

      // Upload valid files
      for (const file of validFiles) {
        uploadFile(file);
      }

      // Reset input so re-selecting the same file works
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [value, uploads, maxImages],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);

      const newUpload: UploadingImage = {
        id,
        file,
        previewUrl,
        status: "uploading",
        s3Key: null,
        errorMessage: null,
      };

      setUploads((prev) => [...prev, newUpload]);

      try {
        const { uploadUrl, s3Key } = await requestPresignedUrl(
          file.name,
          file.type,
        );

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.status}`);
        }

        // Upload succeeded
        setUploads((prev) => prev.filter((u) => u.id !== id));

        onChange([...value, s3Key]);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "error", errorMessage } : u,
          ),
        );
      }
    },
    [value, onChange],
  );

  const retryUpload = useCallback(
    (uploadId: string) => {
      const upload = uploads.find((u) => u.id === uploadId);
      if (!upload) return;

      // Remove the failed upload entry
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));

      // Re-upload the file
      uploadFile(upload.file);
    },
    [uploads, uploadFile],
  );

  const removeUpload = useCallback((uploadId: string) => {
    setUploads((prev) => {
      const upload = prev.find((u) => u.id === uploadId);
      if (upload) {
        URL.revokeObjectURL(upload.previewUrl);
      }
      return prev.filter((u) => u.id !== uploadId);
    });
  }, []);

  const removeExistingImage = useCallback(
    (index: number) => {
      const newKeys = value.filter((_, i) => i !== index);
      onChange(newKeys);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={totalImages >= maxImages}
        >
          <Upload className="h-4 w-4" />
          Upload Images
        </Button>
        <span className="text-xs text-muted-foreground">
          {value.length + uploads.filter((u) => u.status !== "error").length} /{" "}
          {maxImages}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Select images to upload"
      />

      {batchError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{batchError}</span>
        </div>
      )}

      {(value.length > 0 || uploads.length > 0) && (
        <div className="grid grid-cols-5 gap-2">
          {/* Existing uploaded images (s3Keys) */}
          {value.map((s3Key, index) => (
            <div
              key={s3Key}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Image {index + 1}
              </div>
              <button
                type="button"
                onClick={() => removeExistingImage(index)}
                className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* In-progress and errored uploads */}
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <img
                src={upload.previewUrl}
                alt="Upload preview"
                className="h-full w-full object-cover"
              />

              {upload.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {upload.status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="px-1 text-center text-[10px] text-destructive">
                    {upload.errorMessage ?? "Upload failed"}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => retryUpload(upload.id)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label="Retry upload"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUpload(upload.id)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label="Remove failed upload"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {upload.status === "uploading" && (
                <button
                  type="button"
                  onClick={() => removeUpload(upload.id)}
                  className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label="Cancel upload"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
