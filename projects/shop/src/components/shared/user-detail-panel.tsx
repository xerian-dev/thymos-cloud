import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchEmployee } from "@/features/employees/employees-api";
import type { Employee } from "@/features/employees/employees-types";

export interface UserDetailPanelProps {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserDetailPanel({
  open,
  onClose,
  employeeId,
}: UserDetailPanelProps): React.ReactNode {
  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !employeeId) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEmployee(null);

    fetchEmployee(employeeId, controller.signal)
      .then((data) => {
        setEmployee(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load employee details";
        setError(message);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [open, employeeId]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Employee Details</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                Loading employee details…
              </p>
            </div>
          )}

          {error && (
            <div className="py-12 text-center" role="alert">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {employee && !loading && !error && (
            <dl className="grid gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Name
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {employee.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Source ID
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {employee.sourceId}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {formatDate(employee.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {formatDate(employee.updatedAt)}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
