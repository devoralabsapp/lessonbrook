import { describe, expect, it } from "vitest";
import { vietQrPayload } from "@/domain/bank-transfer";
import { parseBankNotification } from "@/domain/bank-notification";

describe("VietQR transfer instructions", () => {
  it("encodes the bank, account, VND amount, exact payment memo and checksum", () => {
    const reference = "CC-2026-000001-4EA8C340B1";
    expect(
      vietQrPayload(
        { bankBin: "970436", accountNumber: "12345678901234" },
        30000,
        reference,
      ),
    ).toBe(
      "00020101021238580010A000000727012800069704360114123456789012340208QRIBFTTA53037045405300005802VN62290825CC-2026-000001-4EA8C340B16304702E",
    );
    expect(
      parseBankNotification(
        `Account 12345678901234\nAmount: + 30,000\nBalance: 50,000\nDEMO SENDER ${reference.toLowerCase()} transfer`,
      ),
    ).toEqual({ accountNumber: "12345678901234", amountVnd: 30000, reference });
  });
});
