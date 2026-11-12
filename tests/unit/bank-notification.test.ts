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

it("accepts an explicitly credited VND amount with a multiline memo and typographic dashes", () => {
  expect(
    parseBankNotification(
      "Account: 12345678901234\rAmount: + 30.000 VND\rBalance: 50.000 ₫\rDEMO SENDER\rMemo: CC–2026–000001–4EA8C340B1",
    ),
  ).toEqual({
    accountNumber: "12345678901234",
    amountVnd: 30000,
    reference: "CC-2026-000001-4EA8C340B1",
  });
  expect(
    parseBankNotification(
      "Account 12345678901234\nAmount: + 30,000\nBalance: 50,000",
    )?.reference,
  ).toBeNull();
});

it("extracts a compact VietQR memo and treats its hyphenated form as the same code", () => {
  const reference = "CC-2026-000123-A23D458E90";
  const compact = reference.replaceAll("-", "");
  expect(parseBankNotification(notice("+ 30,000", compact))?.reference).toBe(
    compact,
  );
  expect(
    parseBankNotification(notice("+ 30,000", `${reference} ${compact}`))
      ?.reference,
  ).toBe(reference);
  expect(
    parseBankNotification(notice("+ 30,000", `${compact} ${memo}`))?.reference,
  ).toBeNull();
  expect(
    parseBankNotification(notice("+ 30,000", `${compact}1`))?.reference,
  ).toBeNull();
});
