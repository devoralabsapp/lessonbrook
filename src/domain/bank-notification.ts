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
const accountLine = String.raw`Account(?:[ \t]*:[ \t]*|[ \t]+)(?<accountNumber>\d{6,32})[ \t]*`;
const balanceAndMemo = String.raw`[ \t]*Balance:[ \t]*-?[ \t]*${amount}${currency}(?:\n(?<memo>[\s\S]*))?$`;
const accountFirstNotice = new RegExp(
  String.raw`^${accountLine}\n[ \t]*Amount:[ \t]*\+[ \t]*(?<credit>${amount})${currency}\n${balanceAndMemo}`,
  "i",
);
const techcombankNotice = new RegExp(
  String.raw`^\+[ \t]*VND[ \t]+(?<credit>${amount})[ \t]*\n[ \t]*${accountLine}\n${balanceAndMemo}`,
  "i",
);
export function parseBankNotification(message: string) {
  const normalized = message
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f]/g, " ")
    .trim();
  const match = (
    accountFirstNotice.exec(normalized) ?? techcombankNotice.exec(normalized)
  )?.groups;
  if (!match) return null;
  const parsedAmount = statementMoneySchema.safeParse(
    Number(match.credit.replace(/[,.]/g, "")),
  );
  if (!parsedAmount.success || parsedAmount.data === 0) return null;
  const references = new Set(
    [
      ...(match.memo ?? "")
        .replace(/[\u2010-\u2014\u2212]/g, "-")
        .matchAll(
          /(?<![a-z\d-])CC(?:-\d{4}-\d{6,10}-[a-f0-9]{6,12}|\d{10}[a-f0-9]{10})(?![a-z\d-])/gi,
        ),
    ].map(([reference]) => reference.toUpperCase()),
  );
  const compactReferences = new Set(
    [...references].map((reference) => reference.replaceAll("-", "")),
  );
  const separated = [...references].filter((reference) =>
    reference.includes("-"),
  );
  return {
    accountNumber: match.accountNumber,
    amountVnd: parsedAmount.data,
    reference:
      compactReferences.size === 1 && separated.length <= 1
        ? (separated[0] ?? [...references][0])
        : null,
  };
}
