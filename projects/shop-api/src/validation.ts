export interface CreateAccountInput {
  accountNumber: number;
  name: string;
  street: string;
  place: string;
  postcode: string;
  canton: string;
  email: string;
  telephone: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; data: CreateAccountInput }
  | { valid: false; errors: ValidationError[] };

export function validateCreateAccount(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (body === null || typeof body !== "object") {
    return {
      valid: false,
      errors: [{ field: "body", message: "Request body must be an object" }],
    };
  }

  const input = body as Record<string, unknown>;

  // Validate accountNumber
  if (typeof input.accountNumber !== "number") {
    errors.push({
      field: "accountNumber",
      message: "accountNumber must be a number",
    });
  } else if (!Number.isInteger(input.accountNumber)) {
    errors.push({
      field: "accountNumber",
      message: "accountNumber must be an integer",
    });
  } else if (input.accountNumber < 1 || input.accountNumber > 9999999) {
    errors.push({
      field: "accountNumber",
      message: "accountNumber must be between 1 and 9999999",
    });
  }

  // Validate name
  if (typeof input.name !== "string") {
    errors.push({ field: "name", message: "name must be a string" });
  } else if (input.name.length < 1 || input.name.length > 100) {
    errors.push({
      field: "name",
      message: "name must be between 1 and 100 characters",
    });
  } else if (!/\S/.test(input.name)) {
    errors.push({
      field: "name",
      message: "name must contain at least one non-whitespace character",
    });
  }

  // Validate street (optional, max 200)
  if (input.street !== undefined && input.street !== null) {
    if (typeof input.street !== "string") {
      errors.push({ field: "street", message: "street must be a string" });
    } else if (input.street.length > 200) {
      errors.push({
        field: "street",
        message: "street must be at most 200 characters",
      });
    }
  }

  // Validate place (optional, max 100)
  if (input.place !== undefined && input.place !== null) {
    if (typeof input.place !== "string") {
      errors.push({ field: "place", message: "place must be a string" });
    } else if (input.place.length > 100) {
      errors.push({
        field: "place",
        message: "place must be at most 100 characters",
      });
    }
  }

  // Validate postcode (optional, max 20)
  if (input.postcode !== undefined && input.postcode !== null) {
    if (typeof input.postcode !== "string") {
      errors.push({
        field: "postcode",
        message: "postcode must be a string",
      });
    } else if (input.postcode.length > 20) {
      errors.push({
        field: "postcode",
        message: "postcode must be at most 20 characters",
      });
    }
  }

  // Validate canton (optional, max 50)
  if (input.canton !== undefined && input.canton !== null) {
    if (typeof input.canton !== "string") {
      errors.push({ field: "canton", message: "canton must be a string" });
    } else if (input.canton.length > 50) {
      errors.push({
        field: "canton",
        message: "canton must be at most 50 characters",
      });
    }
  }

  // Validate email (optional, max 254)
  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== "string") {
      errors.push({ field: "email", message: "email must be a string" });
    } else if (input.email.length > 254) {
      errors.push({
        field: "email",
        message: "email must be at most 254 characters",
      });
    }
  }

  // Validate telephone (optional, max 30)
  if (input.telephone !== undefined && input.telephone !== null) {
    if (typeof input.telephone !== "string") {
      errors.push({
        field: "telephone",
        message: "telephone must be a string",
      });
    } else if (input.telephone.length > 30) {
      errors.push({
        field: "telephone",
        message: "telephone must be at most 30 characters",
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      accountNumber: input.accountNumber as number,
      name: input.name as string,
      street: (input.street as string) ?? "",
      place: (input.place as string) ?? "",
      postcode: (input.postcode as string) ?? "",
      canton: (input.canton as string) ?? "",
      email: (input.email as string) ?? "",
      telephone: (input.telephone as string) ?? "",
    },
  };
}
