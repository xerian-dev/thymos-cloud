import { z } from "zod";

export const saleFormSchema = z.object({
  cashierId: z.string().min(1, { message: "Cashier is required" }),
  memo: z
    .string()
    .max(500, { message: "Memo must be at most 500 characters" })
    .optional()
    .or(z.literal("")),
  status: z.enum(["finalized", "voided"]).optional(),
});

export type SaleFormData = z.infer<typeof saleFormSchema>;
