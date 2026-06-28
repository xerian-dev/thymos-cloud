import { describe, it, expect } from "vitest";
import {
  mapConsignCloudToShop,
  hasFieldChanges,
  type ConsignCloudAccount,
} from "../field-mapper";

function makeAccount(
  overrides: Partial<ConsignCloudAccount> = {},
): ConsignCloudAccount {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    number: "1001",
    first_name: "John",
    last_name: "Doe",
    company: "Acme Inc",
    email: "john@example.com",
    balance: 100,
    email_notifications_enabled: true,
    created: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapConsignCloudToShop", () => {
  it("concatenates first_name and last_name into name", () => {
    const account = makeAccount({ first_name: "John", last_name: "Doe" });
    const result = mapConsignCloudToShop(account);
    expect(result.name).toBe("John Doe");
  });

  it("trims leading and trailing whitespace from the concatenated name", () => {
    const account = makeAccount({
      first_name: " John",
      last_name: "Doe ",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.name).toBe("John Doe");
  });

  it("handles empty first_name by returning only last_name", () => {
    const account = makeAccount({ first_name: "", last_name: "Doe" });
    const result = mapConsignCloudToShop(account);
    expect(result.name).toBe("Doe");
  });

  it("handles empty last_name by returning only first_name", () => {
    const account = makeAccount({ first_name: "John", last_name: "" });
    const result = mapConsignCloudToShop(account);
    expect(result.name).toBe("John");
  });

  it("maps company directly and email to telephone", () => {
    const account = makeAccount({
      company: "Widget Corp",
      email: "info@widget.com",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.company).toBe("Widget Corp");
    expect(result.telephone).toBe("info@widget.com");
  });
});

describe("hasFieldChanges", () => {
  it("returns false when all fields are identical", () => {
    const existing = {
      name: "John Doe",
      company: "Acme Inc",
      telephone: "john@example.com",
    };
    const mapped = {
      name: "John Doe",
      company: "Acme Inc",
      telephone: "john@example.com",
    };
    expect(hasFieldChanges(existing, mapped)).toBe(false);
  });

  it("returns true when name differs", () => {
    const existing = {
      name: "John Doe",
      company: "Acme Inc",
      telephone: "john@example.com",
    };
    const mapped = {
      name: "Jane Doe",
      company: "Acme Inc",
      telephone: "john@example.com",
    };
    expect(hasFieldChanges(existing, mapped)).toBe(true);
  });

  it("returns true when telephone differs", () => {
    const existing = {
      name: "John Doe",
      company: "Acme Inc",
      telephone: "john@example.com",
    };
    const mapped = {
      name: "John Doe",
      company: "Acme Inc",
      telephone: "new@example.com",
    };
    expect(hasFieldChanges(existing, mapped)).toBe(true);
  });

  it("returns false when existing company is undefined and mapped company is empty string", () => {
    const existing = {
      name: "John Doe",
      company: undefined,
      telephone: "john@example.com",
    };
    const mapped = {
      name: "John Doe",
      company: "",
      telephone: "john@example.com",
    };
    expect(hasFieldChanges(existing, mapped)).toBe(false);
  });
});
