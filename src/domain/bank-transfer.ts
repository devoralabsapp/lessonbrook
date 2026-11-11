import { z } from "zod";

export const MAX_TRANSFER_MEMO_LENGTH = 25;
const bankBinSchema = z.string().regex(/^\d{6}$/);
export const bankTransferInputSchema = z
  .object({
    bankBin: bankBinSchema,
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{6,19}$/),
    accountName: z.string().trim().min(1).max(100),
  })
  .strict();
export const bankTransferSchema = bankTransferInputSchema.extend({
  bankName: z.string().trim().min(1).max(100),
});
export type BankTransfer = z.infer<typeof bankTransferSchema>;

const field = (tag: string, value: string) =>
  `${tag}${String(value.length).padStart(2, "0")}${value}`;

// NAPAS QR Switching §6.3.3, Dynamic QR IBFT to Account (ASCII fields).
export function vietQrPayload(
  bank: Pick<BankTransfer, "bankBin" | "accountNumber">,
  amountVnd: number,
  reference: string,
) {
  const account = field("00", bank.bankBin) + field("01", bank.accountNumber);
  const recipient =
    field("00", "A000000727") + field("01", account) + field("02", "QRIBFTTA");
  const payload =
    "000201010212" +
    field("38", recipient) +
    "5303704" +
    field("54", String(amountVnd)) +
    "5802VN" +
    field("62", field("08", reference)) +
    "6304";
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}
