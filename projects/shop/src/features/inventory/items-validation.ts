import { z } from "zod";

export const inventoryTypeSchema = z.enum(["Consignment", "Retail"]);

export const termsSchema = z.enum(["Return To Consignor", "Donate", "Discard"]);

export const itemFormSchema = z.object({
  accountId: z.string().min(1, { message: "Account is required" }),
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(200, { message: "Title must be at most 200 characters" }),
  tagPrice: z
    .number()
    .min(0, { message: "Tag price must be at least 0" })
    .max(999999.99, { message: "Tag price must be at most 999,999.99" })
    .refine(
      (val) => {
        const decimals = val.toString().split(".")[1];
        return !decimals || decimals.length <= 2;
      },
      { message: "Tag price must have at most 2 decimal places" },
    ),
  quantity: z
    .number()
    .int({ message: "Quantity must be a whole number" })
    .min(1, { message: "Quantity must be at least 1" })
    .max(9999, { message: "Quantity must be at most 9,999" }),
  split: z
    .number()
    .int({ message: "Split must be a whole number" })
    .min(0, { message: "Split must be at least 0" })
    .max(100, { message: "Split must be at most 100" }),
  inventoryType: inventoryTypeSchema,
  terms: termsSchema,
  description: z
    .string()
    .max(2000, { message: "Description must be at most 2,000 characters" })
    .optional(),
  details: z
    .string()
    .max(5000, { message: "Details must be at most 5,000 characters" })
    .optional(),
  tags: z
    .array(
      z.string().max(50, { message: "Each tag must be at most 50 characters" }),
    )
    .max(20, { message: "At most 20 tags are allowed" })
    .optional(),
  expirationDate: z
    .string()
    .refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      { message: "Expiration date must be a valid ISO 8601 date" },
    )
    .refine(
      (val) => {
        const date = new Date(val);
        return date > new Date();
      },
      { message: "Expiration date must be in the future" },
    )
    .optional(),
});

export type ItemFormData = z.infer<typeof itemFormSchema>;
