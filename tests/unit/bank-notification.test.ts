import { expect, it } from "vitest";
import { parseBankNotification } from "@/domain/bank-notification";

const memo = "DEMO SENDER CC-2026-000001-4EA8C340B1D2 transfer";
const notice = (amount: string, note: string) =>
  `Account 12345678901234\r\nAmount: ${amount}\r\nBalance:\u00a0 50,000\r\n${note}`;

it("extracts a credit and the exact reference without returning the memo or balance", () => {
  expect(parseBankNotification(notice("+ 30,000", memo))).toEqual({
    accountNumber: "12345678901234",
    amountVnd: 30000,
    reference: "CC-2026-000001-4EA8C340B1D2",
  });
  expect(
    parseBankNotification(notice("+ 30,000", "DEMO SENDER transfer"))
      ?.reference,
  ).toBeNull();
  expect(
    parseBankNotification(
      notice("+ 30,000", `${memo} CC-2026-000002-118F24AAEBA2`),
    )?.reference,
  ).toBeNull();
});

it.each(["- 30,000", "+ 30,00", "+ 0", "+ 30.00", "+ 999999999999999999"])(
  "rejects malformed or outgoing amounts (%s)",
  (amount) => expect(parseBankNotification(notice(amount, memo))).toBeNull(),
);
