import { z } from "zod";

export const accountNumberSchema = z
  .number()
  .int({ message: "Account number must be a whole number" })
  .min(1, { message: "Account number must be at least 1" })
  .max(9999999, { message: "Account number must be at most 9999999" });

export const accountFormSchema = z.object({
  accountNumber: accountNumberSchema,
  name: z
    .string()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be at most 100 characters" })
    .refine((val) => val.trim().length > 0, {
      message: "Name must contain at least one non-whitespace character",
    }),
  street: z
    .string()
    .max(200, { message: "Street must be at most 200 characters" })
    .default(""),
  place: z
    .string()
    .max(100, { message: "Place must be at most 100 characters" })
    .default(""),
  postcode: z
    .string()
    .max(20, { message: "Postcode must be at most 20 characters" })
    .default(""),
  canton: z
    .string()
    .max(50, { message: "Canton must be at most 50 characters" })
    .default(""),
  email: z
    .string()
    .max(254, { message: "Email must be at most 254 characters" })
    .default(""),
  telephone: z
    .string()
    .max(30, { message: "Telephone must be at most 30 characters" })
    .default(""),
});

export interface AccountFormData {
  accountNumber: number;
  name: string;
  street: string;
  place: string;
  postcode: string;
  canton: string;
  email: string;
  telephone: string;
}
