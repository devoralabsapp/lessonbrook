import { z } from "zod";
import { statementMoneySchema } from "./statements";

export const bankAccountSchema = z
  .string()
  .trim()
  .regex(/^\d{6,32}$/);
export const shortcutKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const transferReferenceSchema = z
  .string()
  .regex(/^CC-\d{4}-\d{6,10}-[A-F0-9]{6,12}$/);
export const bankNotificationSchema = z
  .object({
    message: z.string().trim().min(1).max(2048),
  })
  .strict();

const amount = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)`;
const currency = String.raw`[ \t]*(?:VND|₫|đ)?[ \t]*`;
const notice = new RegExp(
  String.raw`^Account(?:[ \t]*:[ \t]*|[ \t]+)(\d{6,32})[ \t]*\n[ \t]*Amount:[ \t]*\+[ \t]*(${amount})${currency}\n[ \t]*Balance:[ \t]*-?[ \t]*${amount}${currency}(?:\n([\s\S]*))?$`,
  "i",
);
export function parseBankNotification(message: string) {
  const normalized = message
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f]/g, " ")
    .trim();
  const match = notice.exec(normalized);
  if (!match) return null;
  const parsedAmount = statementMoneySchema.safeParse(
    Number(match[2].replace(/[,.]/g, "")),
  );
  if (!parsedAmount.success || parsedAmount.data === 0) return null;
  const references = new Set(
    [
      ...(match[3] ?? "")
        .replace(/[\u2010-\u2014\u2212]/g, "-")
        .matchAll(
          /(?<![a-z\d-])CC-\d{4}-\d{6,10}-[a-f0-9]{6,12}(?![a-z\d-])/gi,
        ),
    ].map(([reference]) => reference.toUpperCase()),
  );
  return {
    accountNumber: match[1],
    amountVnd: parsedAmount.data,
    reference: references.size === 1 ? [...references][0] : null,
  };
}
