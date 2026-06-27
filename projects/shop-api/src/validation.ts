export interface CreateAccountInput {
  accountNumber: number;
  name: string;
  address: string;
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

  // Validate address
  if (typeof input.address !== "string") {
    errors.push({ field: "address", message: "address must be a string" });
  } else if (input.address.length > 500) {
    errors.push({
      field: "address",
      message: "address must be at most 500 characters",
    });
  }

  // Validate telephone
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

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      accountNumber: input.accountNumber as number,
      name: input.name as string,
      address: input.address as string,
      telephone: input.telephone as string,
    },
  };
}
