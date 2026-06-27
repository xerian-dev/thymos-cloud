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
  address: z
    .string()
    .max(500, { message: "Address must be at most 500 characters" })
    .default(""),
  telephone: z
    .string()
    .max(30, { message: "Telephone must be at most 30 characters" })
    .default(""),
});

export interface AccountFormData {
  accountNumber: number;
  name: string;
  address: string;
  telephone: string;
}
