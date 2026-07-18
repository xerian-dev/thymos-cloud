import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ImportTypeCard } from "./import-type-card";
import { useImportStatus } from "./use-import-status";
import type { ImportType } from "./imports-types";

const IMPORT_TYPES: ImportType[] = ["items", "sales", "accounts"];

export function ImportsPage(): React.ReactNode {
  const {
    status,
    loading,
    error,
    refresh,
    startImport,
    resumeImport,
    cancelImport,
    actionError,
    clearActionError,
  } = useImportStatus();

  if (loading && !status) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
        </div>
        <p className="text-sm text-muted-foreground">Loading import status…</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
        </div>
        <div className="rounded border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          aria-label="Refresh import status"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between rounded border border-destructive/50 bg-destructive/5 p-3"
        >
          <p className="text-sm text-destructive">{actionError}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearActionError}
            aria-label="Dismiss error"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        {IMPORT_TYPES.map((type) => (
          <ImportTypeCard
            key={type}
            type={type}
            job={status?.[type] ?? null}
            onStart={startImport}
            onResume={resumeImport}
            onCancel={cancelImport}
          />
        ))}
      </div>
    </div>
  );
}
