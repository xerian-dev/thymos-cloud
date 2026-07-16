import { describe, it, expect } from "vitest";
import { mapAccount } from "./account-mapper";

describe("account-mapper", () => {
  const fullRawAccount: Record<string, unknown> = {
    id: "abc-123",
    number: "1042",
    first_name: "Hans",
    last_name: "Müller",
    company: "Müller GmbH",
    address_line_1: "Bahnhofstrasse 10",
    address_line_2: "Postfach 42",
    city: "Zürich",
    postal_code: "8001",
    state: "ZH",
    email: "hans@example.com",
    phone_number: "+41791234567",
    balance: 5000,
    consignor_split: 0.6,
    terms: "Return To Consignor",
    inventory_type: "Consignment",
    email_notifications_enabled: true,
    created: "2024-01-15T10:30:00Z",
  };

  it("maps a full ConsignCloud account to MappedAccount", () => {
    const result = mapAccount(fullRawAccount);

    expect(result).toEqual({
      firstName: "Hans",
      lastName: "Müller",
      company: "Müller GmbH",
      street: "Bahnhofstrasse 10, Postfach 42",
      addressLine2: "Postfach 42",
      place: "Zürich",
      postcode: "8001",
      canton: "ZH",
      email: "hans@example.com",
      telephone: "0791234567",
      balance: 5000,
      defaultSplit: 0.6,
      defaultTerms: "Return To Consignor",
      defaultInventoryType: "Consignment",
      emailNotificationsEnabled: true,
      isVendor: true,
      taxExempt: false,
      tags: ["email_notification", "text_notification"],
      accountNumber: 1042,
      sourceId: "abc-123",
      createdAt: "2024-01-15T10:30:00Z",
    });
  });

  it("defaults missing string fields to empty string", () => {
    const result = mapAccount({ id: "x", created: "2024-01-01T00:00:00Z" });

    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.company).toBe("");
    expect(result.street).toBe("");
    expect(result.addressLine2).toBe("");
    expect(result.place).toBe("");
    expect(result.postcode).toBe("");
    expect(result.canton).toBe("");
    expect(result.email).toBe("");
    expect(result.telephone).toBe("");
  });

  it("defaults missing numeric fields to 0", () => {
    const result = mapAccount({ id: "x", created: "2024-01-01T00:00:00Z" });

    expect(result.balance).toBe(0);
    expect(result.defaultSplit).toBe(0);
    expect(result.accountNumber).toBe(0);
  });

  it("defaults missing boolean fields to false", () => {
    const result = mapAccount({ id: "x", created: "2024-01-01T00:00:00Z" });

    expect(result.emailNotificationsEnabled).toBe(false);
  });

  it("always sets isVendor to true", () => {
    const result = mapAccount({});

    expect(result.isVendor).toBe(true);
  });

  it("always sets taxExempt to false", () => {
    const result = mapAccount({});

    expect(result.taxExempt).toBe(false);
  });

  it("normalizes Swiss phone numbers", () => {
    const result = mapAccount({ phone_number: "0041781112233" });

    expect(result.telephone).toBe("0781112233");
  });

  it("uses buildStreet to combine address lines for street field", () => {
    const result = mapAccount({
      address_line_1: "Line 1",
      address_line_2: "Line 2",
    });

    expect(result.street).toBe("Line 1, Line 2");
  });

  it("maps address_line_2 directly to addressLine2", () => {
    const result = mapAccount({ address_line_2: "Apt 5" });

    expect(result.addressLine2).toBe("Apt 5");
  });

  it("derives tags from email notifications and mobile phone", () => {
    const result = mapAccount({
      email_notifications_enabled: true,
      phone_number: "0771234567",
    });

    expect(result.tags).toContain("email_notification");
    expect(result.tags).toContain("text_notification");
  });

  it("derives empty tags when notifications disabled and no mobile phone", () => {
    const result = mapAccount({
      email_notifications_enabled: false,
      phone_number: "0441234567",
    });

    expect(result.tags).toEqual([]);
  });

  it("is idempotent — same input always produces same output", () => {
    const result1 = mapAccount(fullRawAccount);
    const result2 = mapAccount(fullRawAccount);

    expect(result1).toEqual(result2);
  });
});
