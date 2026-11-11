import { z } from "zod";
import { dateSchema, idSchema } from ".";
import { statementMoneySchema } from "./statements";
export const MAX_ACTIVE_PAYMENTS = 100;
export const paymentInputSchema = z
  .object({
    amountVnd: statementMoneySchema.refine(
      (value) => value > 0,
      "Số tiền phải lớn hơn 0đ.",
    ),
    receivedDate: dateSchema,
    method: z.enum(["cash", "transfer"]),
    privateNote: z.string().trim().max(500).default(""),
  })
  .strict();
export const paymentVoidInputSchema = z
  .object({
    reason: z.string().trim().min(1, "Nhập lý do vô hiệu hóa.").max(500),
  })
  .strict();
export const paymentEditInputSchema = paymentInputSchema
  .omit({ method: true })
  .extend({
    expectedUpdatedAt: z.iso.datetime().nullable(),
  });
export const paymentSchema = paymentInputSchema
  .extend({
    id: idSchema,
    statementId: idSchema,
    studentId: idSchema,
    recordedAt: z.string(),
    updatedAt: z.iso.datetime().optional(),
    voidedAt: z.string().nullable(),
    voidReason: z.string().max(500).nullable(),
    requestId: z.string().uuid(),
    schemaVersion: z.literal(1),
  })
  .strict();
export type Payment = z.infer<typeof paymentSchema>;
