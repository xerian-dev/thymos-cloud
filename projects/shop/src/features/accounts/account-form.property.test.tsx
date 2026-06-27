import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { AccountForm } from "./account-form";
import { createAccount } from "./accounts-api";

/**
 * Feature: accounts-page, Property 10: Error messages use accessible attributes
 *
 * For any field with a validation error, the corresponding input SHALL have
 * aria-invalid="true" and an aria-describedby attribute referencing the error
 * message element. For any displayed error message (validation or submission),
 * the error element SHALL have role="alert".
 *
 * Validates: Requirements 10.4, 10.5
 */

vi.mock("./accounts-api", () => ({
  createAccount: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const noop = (): void => {};

describe("Feature: accounts-page, Property 10: Error messages use accessible attributes", () => {
  it("invalid account number field has aria-invalid and aria-describedby pointing to an element with role=alert", () => {
    // Generate invalid account numbers: non-numeric strings, zero, negative, too large
    const invalidAccountNumberArb = fc.oneof(
      fc.constantFrom("", "abc", "0", "-1", "99999999", "3.14", "  "),
      fc.integer({ min: -1000, max: 0 }).map((n) => n.toString()),
      fc.integer({ min: 10000000, max: 99999999 }).map((n) => n.toString()),
    );

    fc.assert(
      fc.property(invalidAccountNumberArb, (invalidAccNum: string) => {
        cleanup();
        render(
          <AccountForm
            open={true}
            onClose={noop}
            onSuccess={noop}
            defaultAccountNumber={null}
          />,
        );

        const accountNumberInput = screen.getByLabelText(/account number/i);
        const nameInput = screen.getByLabelText(/name/i);
        const form = accountNumberInput.closest("form")!;

        // Set invalid account number and valid name
        act(() => {
          // Clear and type the invalid value
          (accountNumberInput as HTMLInputElement).focus();
          (accountNumberInput as HTMLInputElement).value = invalidAccNum;
          accountNumberInput.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          accountNumberInput.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        });

        // Provide a valid name so the error is isolated to account number
        act(() => {
          (nameInput as HTMLInputElement).focus();
          (nameInput as HTMLInputElement).value = "Valid Name";
          nameInput.dispatchEvent(new Event("input", { bubbles: true }));
          nameInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Submit the form
        act(() => {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        });

        // Verify accessibility attributes on the account number input
        expect(accountNumberInput.getAttribute("aria-invalid")).toBe("true");

        const describedBy = accountNumberInput.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();

        // Find the element referenced by aria-describedby
        const errorElement = document.getElementById(describedBy!);
        expect(errorElement).not.toBeNull();
        expect(errorElement!.getAttribute("role")).toBe("alert");
      }),
      { numRuns: 50 },
    );
  }, 60000);

  it("invalid name field has aria-invalid and aria-describedby pointing to an element with role=alert", () => {
    // Generate invalid names: empty strings and whitespace-only strings
    const invalidNameArb = fc.oneof(
      fc.constant(""),
      fc
        .constantFrom(" ", "\t", "\n")
        .chain((ws) =>
          fc.integer({ min: 1, max: 10 }).map((len) => ws.repeat(len)),
        ),
    );

    fc.assert(
      fc.property(invalidNameArb, (invalidName: string) => {
        cleanup();
        render(
          <AccountForm
            open={true}
            onClose={noop}
            onSuccess={noop}
            defaultAccountNumber={null}
          />,
        );

        const accountNumberInput = screen.getByLabelText(/account number/i);
        const nameInput = screen.getByLabelText(/name/i);
        const form = accountNumberInput.closest("form")!;

        // Set a valid account number so the error is isolated to name
        act(() => {
          (accountNumberInput as HTMLInputElement).focus();
          (accountNumberInput as HTMLInputElement).value = "1234";
          accountNumberInput.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
          accountNumberInput.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        });

        // Set the invalid name
        act(() => {
          (nameInput as HTMLInputElement).focus();
          (nameInput as HTMLInputElement).value = invalidName;
          nameInput.dispatchEvent(new Event("input", { bubbles: true }));
          nameInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Submit the form
        act(() => {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        });

        // Verify accessibility attributes on the name input
        expect(nameInput.getAttribute("aria-invalid")).toBe("true");

        const describedBy = nameInput.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();

        // Find the element referenced by aria-describedby
        const errorElement = document.getElementById(describedBy!);
        expect(errorElement).not.toBeNull();
        expect(errorElement!.getAttribute("role")).toBe("alert");
      }),
      { numRuns: 50 },
    );
  }, 60000);

  it("API error messages have role=alert", async () => {
    const { createAccount } = await import("./accounts-api");
    const mockedCreateAccount = vi.mocked(createAccount);

    const errorTypeArb = fc.constantFrom(
      "duplicate",
      "network",
      "server",
      "timeout",
      "max_reached",
    ) as fc.Arbitrary<
      "duplicate" | "network" | "server" | "timeout" | "max_reached"
    >;

    // Cannot use fc.assert with async property easily, so test each error type
    const errorTypes = [
      "duplicate",
      "network",
      "server",
      "timeout",
      "max_reached",
    ] as const;

    for (const errorType of errorTypes) {
      cleanup();
      vi.clearAllMocks();

      mockedCreateAccount.mockResolvedValue({
        success: false,
        error: errorType,
      });

      render(
        <AccountForm
          open={true}
          onClose={noop}
          onSuccess={noop}
          defaultAccountNumber={null}
        />,
      );

      const accountNumberInput = screen.getByLabelText(/account number/i);
      const nameInput = screen.getByLabelText(/name/i);
      const form = accountNumberInput.closest("form")!;

      // Set valid values to pass validation
      act(() => {
        (accountNumberInput as HTMLInputElement).focus();
        (accountNumberInput as HTMLInputElement).value = "42";
        accountNumberInput.dispatchEvent(new Event("input", { bubbles: true }));
        accountNumberInput.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
      });

      act(() => {
        (nameInput as HTMLInputElement).focus();
        (nameInput as HTMLInputElement).value = "Valid Name";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Submit the form
      await act(async () => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });

      // Wait for the error message to appear
      await waitFor(() => {
        const alerts = screen.getAllByRole("alert");
        expect(alerts.length).toBeGreaterThan(0);
      });

      // Verify the error message has role="alert"
      const alerts = screen.getAllByRole("alert");
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].textContent).toBeTruthy();
    }
  }, 60000);
});

/**
 * Feature: accounts-page, Property 4: Invalid form data prevents API submission
 *
 * For any form state where at least one field fails validation, submitting the
 * form SHALL NOT trigger an API call to the backend.
 *
 * Validates: Requirements 6.4
 */

describe("Feature: accounts-page, Property 4: Invalid form data prevents API submission", () => {
  const mockedCreateAccount = vi.mocked(createAccount);

  /** Invalid account number variants */
  const invalidAccountNumberArb: fc.Arbitrary<string> = fc.constantFrom(
    "0",
    "-1",
    "10000000",
    "",
    "abc",
    "3.14",
  );

  /** Valid account number variants (1-9999999 as string) */
  const validAccountNumberArb: fc.Arbitrary<string> = fc
    .integer({ min: 1, max: 9999999 })
    .map(String);

  /** Invalid name variants */
  const invalidNameArb: fc.Arbitrary<string> = fc.constantFrom(
    "",
    "   ",
    "a".repeat(101),
  );

  /** Valid name variants (non-whitespace, 1-100 chars) */
  const validNameArb: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  it("does not call createAccount when account number is invalid and name is valid", () => {
    fc.assert(
      fc.property(invalidAccountNumberArb, validNameArb, (accountNum, name) => {
        cleanup();
        mockedCreateAccount.mockClear();

        render(
          <AccountForm
            open={true}
            onClose={noop}
            onSuccess={noop}
            defaultAccountNumber={null}
          />,
        );

        const accountNumberInput = screen.getByLabelText(/account number/i);
        const nameInput = screen.getByLabelText(/name/i);
        const form = accountNumberInput.closest("form")!;

        act(() => {
          (accountNumberInput as HTMLInputElement).value = accountNum;
          accountNumberInput.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        });

        act(() => {
          (nameInput as HTMLInputElement).value = name;
          nameInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        act(() => {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        });

        expect(mockedCreateAccount).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it("does not call createAccount when name is invalid and account number is valid", () => {
    fc.assert(
      fc.property(validAccountNumberArb, invalidNameArb, (accountNum, name) => {
        cleanup();
        mockedCreateAccount.mockClear();

        render(
          <AccountForm
            open={true}
            onClose={noop}
            onSuccess={noop}
            defaultAccountNumber={null}
          />,
        );

        const accountNumberInput = screen.getByLabelText(/account number/i);
        const nameInput = screen.getByLabelText(/name/i);
        const form = accountNumberInput.closest("form")!;

        act(() => {
          (accountNumberInput as HTMLInputElement).value = accountNum;
          accountNumberInput.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        });

        act(() => {
          (nameInput as HTMLInputElement).value = name;
          nameInput.dispatchEvent(new Event("change", { bubbles: true }));
        });

        act(() => {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        });

        expect(mockedCreateAccount).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it("does not call createAccount when both account number and name are invalid", () => {
    fc.assert(
      fc.property(
        invalidAccountNumberArb,
        invalidNameArb,
        (accountNum, name) => {
          cleanup();
          mockedCreateAccount.mockClear();

          render(
            <AccountForm
              open={true}
              onClose={noop}
              onSuccess={noop}
              defaultAccountNumber={null}
            />,
          );

          const accountNumberInput = screen.getByLabelText(/account number/i);
          const nameInput = screen.getByLabelText(/name/i);
          const form = accountNumberInput.closest("form")!;

          act(() => {
            (accountNumberInput as HTMLInputElement).value = accountNum;
            accountNumberInput.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
          });

          act(() => {
            (nameInput as HTMLInputElement).value = name;
            nameInput.dispatchEvent(new Event("change", { bubbles: true }));
          });

          act(() => {
            form.dispatchEvent(
              new Event("submit", { bubbles: true, cancelable: true }),
            );
          });

          expect(mockedCreateAccount).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});
