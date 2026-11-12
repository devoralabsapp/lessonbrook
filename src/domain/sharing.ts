import { z } from "zod";
import { dateSchema } from ".";
import { statementMoneySchema, statementVersionSchema } from "./statements";
import { MAX_ACTIVE_PAYMENTS } from "./payments";
import { transferReferenceSchema } from "./bank-notification";
import { bankTransferSchema } from "./bank-transfer";
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const shareCreateInputSchema = z
  .object({
    version: statementVersionSchema,
    previewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const shareRevokeInputSchema = z
  .object({ version: statementVersionSchema })
  .strict();
export const publicStatementSchema = z
  .object({
    teacherName: z.string().min(1).max(100),
    recipientName: z.string().min(1).max(100),
    number: z.string().regex(/^CC-\d{4}-\d{6,10}$/),
    issueDate: dateSchema,
    dueDate: dateSchema,
    items: z
      .array(
        z
          .object({ sessionDate: dateSchema, amountVnd: statementMoneySchema })
          .strict(),
      )
      .min(1)
      .max(100),
    totalVnd: statementMoneySchema,
    paidVnd: statementMoneySchema,
    remainingVnd: statementMoneySchema,
    payments: z
      .array(
        z
          .object({ receivedDate: dateSchema, amountVnd: statementMoneySchema })
          .strict(),
      )
      .max(MAX_ACTIVE_PAYMENTS),
    bankDetails: z.string().max(500).nullable(),
    bankTransfer: bankTransferSchema.optional(),
    transferReference: transferReferenceSchema.optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PublicStatement = z.infer<typeof publicStatementSchema>;
export type SharePreview = {
  statement: PublicStatement;
  version: number;
  previewHash: string;
};
export type StatementEmailOptions =
  | { available: false }
  | { available: true; recipient: string | null; sender: string };
export type ShareStatus = { active: boolean; expiresAt: string | null };
export type ShareResult = {
  id: string;
  token: string | null;
  tokenHash: string | null;
  expiresAt: string | null;
};
