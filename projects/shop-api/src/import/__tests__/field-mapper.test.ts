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

  it("maps company directly", () => {
    const account = makeAccount({
      company: "Widget Corp",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.company).toBe("Widget Corp");
  });

  it("maps email to email field", () => {
    const account = makeAccount({
      email: "info@widget.com",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.email).toBe("info@widget.com");
  });

  it("normalizes phone_number to telephone", () => {
    const account = makeAccount({
      phone_number: "+41791234567",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.telephone).toBe("0791234567");
  });

  it("builds street from address lines", () => {
    const account = makeAccount({
      address_line_1: "Bahnhofstrasse 1",
      address_line_2: "Postfach 42",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.street).toBe("Bahnhofstrasse 1, Postfach 42");
  });

  it("maps city to place, postal_code to postcode, state to canton", () => {
    const account = makeAccount({
      city: "Zürich",
      postal_code: "8001",
      state: "ZH",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.place).toBe("Zürich");
    expect(result.postcode).toBe("8001");
    expect(result.canton).toBe("ZH");
  });

  it("defaults place, postcode, canton to empty string when null", () => {
    const account = makeAccount({
      city: undefined,
      postal_code: undefined,
      state: undefined,
    });
    const result = mapConsignCloudToShop(account);
    expect(result.place).toBe("");
    expect(result.postcode).toBe("");
    expect(result.canton).toBe("");
  });

  it("derives tags from email_notifications_enabled and mobile prefix", () => {
    const account = makeAccount({
      email_notifications_enabled: true,
      phone_number: "+41791234567",
    });
    const result = mapConsignCloudToShop(account);
    expect(result.tags).toContain("email_notification");
    expect(result.tags).toContain("text_notification");
  });
});

describe("hasFieldChanges", () => {
  const baseMapped = {
    name: "John Doe",
    company: "Acme Inc",
    street: "Main St 1",
    place: "Zürich",
    postcode: "8001",
    canton: "ZH",
    email: "john@example.com",
    telephone: "0791234567",
    tags: ["email_notification"],
  };

  it("returns false when all fields are identical", () => {
    const existing = { ...baseMapped };
    expect(hasFieldChanges(existing, baseMapped)).toBe(false);
  });

  it("returns true when name differs", () => {
    const existing = { ...baseMapped, name: "Jane Doe" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when telephone differs", () => {
    const existing = { ...baseMapped, telephone: "0781111111" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when street differs", () => {
    const existing = { ...baseMapped, street: "Other St" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when place differs", () => {
    const existing = { ...baseMapped, place: "Bern" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when postcode differs", () => {
    const existing = { ...baseMapped, postcode: "3000" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when canton differs", () => {
    const existing = { ...baseMapped, canton: "BE" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when email differs", () => {
    const existing = { ...baseMapped, email: "other@example.com" };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns true when tags differ", () => {
    const existing = { ...baseMapped, tags: ["text_notification"] };
    expect(hasFieldChanges(existing, baseMapped)).toBe(true);
  });

  it("returns false when tags are same but in different order", () => {
    const mapped = {
      ...baseMapped,
      tags: ["email_notification", "text_notification"],
    };
    const existing = {
      ...baseMapped,
      tags: ["text_notification", "email_notification"],
    };
    expect(hasFieldChanges(existing, mapped)).toBe(false);
  });

  it("returns false when existing company is undefined and mapped company is empty string", () => {
    const mapped = { ...baseMapped, company: "" };
    const existing = { ...baseMapped, company: undefined };
    expect(hasFieldChanges(existing, mapped)).toBe(false);
  });

  it("returns false when existing optional fields are undefined and mapped are empty string", () => {
    const mapped = {
      ...baseMapped,
      street: "",
      place: "",
      postcode: "",
      canton: "",
      email: "",
      telephone: "",
    };
    const existing = {
      name: baseMapped.name,
      company: baseMapped.company,
      street: undefined,
      place: undefined,
      postcode: undefined,
      canton: undefined,
      email: undefined,
      telephone: undefined,
      tags: baseMapped.tags,
    };
    expect(hasFieldChanges(existing, mapped)).toBe(false);
  });
});
