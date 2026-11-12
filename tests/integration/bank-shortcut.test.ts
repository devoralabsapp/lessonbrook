import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { client, googleToken, origin } from "./helpers";

const accountNumber = "12345678901234";
const message = (memo: string, amount = "30,000", account = accountNumber) =>
  `Account ${account}\r\nAmount: + ${amount}\r\nBalance:\u00a0 30,000\r\n${memo}`;

async function setup(withBankTransfer = false) {
  const app = await client("en");
  const identity = await googleToken();
  await app.login(identity.idToken);
  async function create(path: string, body: unknown) {
    const response = await app.call(path, "POST", body);
    expect(response.status).toBe(200);
    return response.json();
  }
  const student = await create("/api/students", {
    displayName: "Demo learner",
    defaultRateVnd: 30000,
  });
  const lesson = await create("/api/sessions", {
    studentId: student.id,
    sessionDate: "2026-10-12",
    status: "completed",
    billable: true,
  });
  const statement = await create("/api/statements", {
    studentId: student.id,
    sessionIds: [lesson.id],
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    dueDate: "2026-10-31",
  });
  const path = `/api/statements/${statement.id}`;
  const saveBank = (number: string) =>
    app.call("/api/profile/bank-transfer", "PATCH", {
      bankTransfer: {
        bankBin: "970436",
        accountNumber: number,
        accountName: "DEMO ACCOUNT HOLDER",
      },
    });
  if (withBankTransfer)
    expect((await saveBank(accountNumber)).status).toBe(200);
  await create(`${path}/issue`, { version: 1 });
  const detail = await (await app.call(path)).json();
  const connect = async (number = accountNumber) => {
    const secret = randomBytes(32).toString("hex");
    const { id } = await create("/api/bank-shortcut", {
      accountNumber: number,
      secret,
    });
    return `Bearer ${id}.${secret}`;
  };
  return { app, path, detail, connect, identity, saveBank };
}

const send = (notice: string, authorization?: string) =>
  fetch(`${origin}/api/bank-notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization && { Authorization: authorization }),
    },
    body: JSON.stringify({ message: notice }),
  });

describe("iPhone bank notification Shortcut", () => {
  it("freezes the saved account at issue and settles the VietQR reference once", async () => {
    const teacher = await setup(true);
    const reference = teacher.detail.transferReference;
    expect(reference).toMatch(/^CC-\d{4}-\d{6}-[A-F0-9]{10}$/);
    const bank = {
      bankBin: "970436",
      bankName: "Vietcombank",
      accountNumber,
      accountName: "DEMO ACCOUNT HOLDER",
    };
    expect(teacher.detail.bankTransferSnapshot).toEqual(bank);
    expect(teacher.detail.bankSnapshot).toBeNull();

    const newAccount = "98765432109876";
    expect((await teacher.saveBank(newAccount)).status).toBe(200);
    const preview = async () =>
      (await (await teacher.app.call(`${teacher.path}/public-preview`)).json())
        .statement;
    expect(await preview()).toMatchObject({
      bankTransfer: bank,
      transferReference: reference,
      remainingVnd: 30000,
    });
    const wrongKey = await teacher.connect(newAccount);
    expect(
      (await send(message(reference, "30,000", newAccount), wrongKey)).status,
    ).toBe(409);
    const key = await teacher.connect();
    expect((await send(message(reference, "20,000"), key)).status).toBe(409);
    const reformatted = [
      `Account: ${accountNumber}`,
      "Amount: + 30.000 VND",
      "Balance: 30.000 ₫",
      "DEMO SENDER",
      `Memo: ${reference.replaceAll("-", "–")}`,
    ].join("\r");
    expect(await (await send(reformatted, key)).json()).toEqual({
      status: "recorded",
    });
    expect(await (await send(message(reference), key)).json()).toEqual({
      status: "duplicate",
    });
    expect(await preview()).toMatchObject({
      bankTransfer: bank,
      paidVnd: 30000,
      remainingVnd: 0,
    });
  });

  it("upgrades an existing key and renews an expired session during payment delivery", async () => {
    const teacher = await setup();
    const key = await teacher.connect();
    const [selector, secret] = key.slice("Bearer ".length).split(".");
    const ref = admin().db.doc(`apps/chotcong/bankShortcuts/${selector}`);
    const notice = message(teacher.detail.transferReference);
    await ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    expect((await send(notice, key)).status).toBe(401);
    const other = await googleToken();
    expect(
      (
        await teacher.app.call("/api/bank-shortcut/upgrade", "POST", {
          secret,
          refreshToken: other.refreshToken,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await teacher.app.call("/api/bank-shortcut/upgrade", "POST", {
          secret,
          refreshToken: teacher.identity.refreshToken,
        })
      ).status,
    ).toBe(200);
    expect(await (await teacher.app.call("/api/bank-shortcut")).json()).toEqual(
      { accountLast4: "1234", renewable: true, expiresAt: null },
    );

    const expired = Timestamp.fromMillis(Date.now() - 60_000);
    await ref.update({ expiresAt: expired });
    const results = await Promise.all([send(notice, key), send(notice, key)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(
      (await Promise.all(results.map((result) => result.json())))
        .map((result) => result.status)
        .sort(),
    ).toEqual(["duplicate", "recorded"]);
    const renewed = (await ref.get()).data()!;
    expect(renewed.expiresAt.toMillis()).toBeGreaterThan(Date.now());
    expect(renewed.keyHash).not.toBe(secret);
    expect(JSON.stringify(renewed)).not.toContain(
      teacher.identity.refreshToken,
    );
    await admin().auth.updateUser(teacher.identity.uid, { disabled: true });
    expect((await send(notice, key)).status).toBe(401);
  });

  it("matches the receiving account and unique reference, then records the exact outstanding amount once", async () => {
    const teacher = await setup();
    const otherTeacher = await setup();
    const firstKey = await teacher.connect();
    const key = await teacher.connect();
    const reference = teacher.detail.transferReference;
    expect(reference).toMatch(/^CC-\d{4}-\d{6}-[A-F0-9]{12}$/);
    expect(otherTeacher.detail.number).toBe(teacher.detail.number);
    expect(otherTeacher.detail.transferReference).not.toBe(reference);
    const notice = message(`DEMO SENDER ${reference} transfer`);
    expect((await send(notice)).status).toBe(401);
    expect((await send(notice, firstKey)).status).toBe(401);
    expect(
      await (await send(message("DEMO SENDER transfer"), key)).json(),
    ).toEqual({ status: "missing_reference" });
    expect(
      await (
        await send(message(reference, "30,000", "98765432109876"), key)
      ).json(),
    ).toEqual({ status: "account_mismatch" });
    expect(
      (await send(message(otherTeacher.detail.transferReference), key)).status,
    ).toBe(404);
    expect((await send(message(reference, "20,000"), key)).status).toBe(409);
    const results = await Promise.all([send(notice, key), send(notice, key)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(
      (await Promise.all(results.map((result) => result.json())))
        .map((result) => result.status)
        .sort(),
    ).toEqual(["duplicate", "recorded"]);
    expect((await (await teacher.app.call(teacher.path)).json()).paidVnd).toBe(
      30000,
    );
    expect(
      (await (await otherTeacher.app.call(otherTeacher.path)).json()).paidVnd,
    ).toBe(0);
    const payments = await (
      await teacher.app.call(`${teacher.path}/payments`)
    ).json();
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0]).toMatchObject({
      method: "transfer",
      amountVnd: 30000,
      privateNote: "",
    });
    expect(
      (
        await teacher.app.call(
          `/api/payments/${payments.items[0].id}/void`,
          "POST",
          { reason: "Demo reversal" },
        )
      ).status,
    ).toBe(200);
    expect(await (await send(notice, key)).json()).toEqual({
      status: "duplicate",
    });
    expect((await (await teacher.app.call(teacher.path)).json()).paidVnd).toBe(
      0,
    );
    expect(
      (await teacher.app.call("/api/bank-shortcut/disconnect", "POST", {}))
        .status,
    ).toBe(200);
    expect((await send(notice, key)).status).toBe(401);
  });
});
