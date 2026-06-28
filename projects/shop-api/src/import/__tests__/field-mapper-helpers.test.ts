import { describe, it, expect } from "vitest";
import {
  normalizeSwissPhone,
  buildStreet,
  deriveImportTags,
} from "../field-mapper";

describe("normalizeSwissPhone", () => {
  it("returns empty string for null", () => {
    expect(normalizeSwissPhone(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeSwissPhone(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeSwissPhone("")).toBe("");
  });

  it("strips +41 prefix and prepends 0", () => {
    expect(normalizeSwissPhone("+41791234567")).toBe("0791234567");
  });

  it("strips 0041 prefix and prepends 0", () => {
    expect(normalizeSwissPhone("0041791234567")).toBe("0791234567");
  });

  it("returns unchanged phone when no Swiss prefix", () => {
    expect(normalizeSwissPhone("0791234567")).toBe("0791234567");
  });

  it("handles +41 with shorter numbers", () => {
    expect(normalizeSwissPhone("+4179")).toBe("079");
  });

  it("handles 0041 with shorter numbers", () => {
    expect(normalizeSwissPhone("004179")).toBe("079");
  });
});

describe("buildStreet", () => {
  it("concatenates both lines with comma separator when both present", () => {
    expect(buildStreet("Line 1", "Line 2")).toBe("Line 1, Line 2");
  });

  it("returns addressLine1 when only line1 is present", () => {
    expect(buildStreet("Line 1", null)).toBe("Line 1");
  });

  it("returns addressLine1 when line2 is undefined", () => {
    expect(buildStreet("Line 1", undefined)).toBe("Line 1");
  });

  it("returns addressLine2 when only line2 is present", () => {
    expect(buildStreet(null, "Line 2")).toBe("Line 2");
  });

  it("returns addressLine2 when line1 is undefined", () => {
    expect(buildStreet(undefined, "Line 2")).toBe("Line 2");
  });

  it("returns empty string when both are null", () => {
    expect(buildStreet(null, null)).toBe("");
  });

  it("returns empty string when both are undefined", () => {
    expect(buildStreet(undefined, undefined)).toBe("");
  });

  it("treats empty string as falsy and returns empty string", () => {
    expect(buildStreet("", "")).toBe("");
  });

  it("returns line2 when line1 is empty string", () => {
    expect(buildStreet("", "Line 2")).toBe("Line 2");
  });
});

describe("deriveImportTags", () => {
  it("returns email_notification when emailNotificationsEnabled is true", () => {
    const tags = deriveImportTags(true, "0441234567");
    expect(tags).toContain("email_notification");
    expect(tags).not.toContain("text_notification");
  });

  it("does not return email_notification when emailNotificationsEnabled is false", () => {
    const tags = deriveImportTags(false, "0441234567");
    expect(tags).not.toContain("email_notification");
  });

  it("returns text_notification when phone starts with 079", () => {
    const tags = deriveImportTags(false, "0791234567");
    expect(tags).toContain("text_notification");
  });

  it("returns text_notification when phone starts with 078", () => {
    const tags = deriveImportTags(false, "0781234567");
    expect(tags).toContain("text_notification");
  });

  it("returns text_notification when phone starts with 077", () => {
    const tags = deriveImportTags(false, "0771234567");
    expect(tags).toContain("text_notification");
  });

  it("does not return text_notification for non-mobile prefix", () => {
    const tags = deriveImportTags(false, "0441234567");
    expect(tags).not.toContain("text_notification");
  });

  it("returns both tags when email enabled and mobile prefix", () => {
    const tags = deriveImportTags(true, "0791234567");
    expect(tags).toContain("email_notification");
    expect(tags).toContain("text_notification");
    expect(tags).toHaveLength(2);
  });

  it("returns empty array when email disabled and no mobile prefix", () => {
    const tags = deriveImportTags(false, "0441234567");
    expect(tags).toHaveLength(0);
  });

  it("returns empty array for empty phone string with email disabled", () => {
    const tags = deriveImportTags(false, "");
    expect(tags).toHaveLength(0);
  });
});
