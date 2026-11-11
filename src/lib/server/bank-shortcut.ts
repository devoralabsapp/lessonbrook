import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  bankAccountSchema,
  shortcutKeySchema,
} from "@/domain/bank-notification";
import type { Statement } from "@/domain/statements";
import { admin } from "@/lib/firebase/admin";
import { accountKey, assertAccountAvailable } from "./account-access";
import { AppError } from "./errors";
import { operation } from "./repository";
import { openSealedSession, sealSession } from "./sealed-session";

const connectionSchema = z
  .object({
    accountNumber: bankAccountSchema,
    keyHash: shortcutKeySchema,
    sealedSession: z.string().min(38),
    expiresAt: z.instanceof(Timestamp),
    schemaVersion: z.literal(1),
  })
  .strict();
const connections = () => admin().db.collection("apps/chotcong/bankShortcuts");
export const bankShortcutRef = (uid: string) =>
  connections().doc(accountKey(uid));
const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const unauthorized = () =>
  new AppError(401, "Kết nối Phím tắt không hợp lệ hoặc đã hết hạn.");
const context = (selector: string) => `bank-shortcut:${selector}`;
export const transferReferenceFor = (
  statement: Pick<Statement, "number" | "id">,
) =>
  statement.number
    ? `${statement.number}-${hash(statement.id).slice(0, 12).toUpperCase()}`
    : null;

export async function getBankShortcut(uid: string) {
  const doc = await bankShortcutRef(uid).get();
  if (!doc.exists) return null;
  const connection = connectionSchema.parse(doc.data());
  return {
    accountLast4: connection.accountNumber.slice(-4),
    expiresAt: connection.expiresAt.toDate().toISOString(),
  };
}

export async function connectBankShortcut(
  uid: string,
  session: string,
  expiresAt: number,
  raw: unknown,
  requestId: string,
) {
  const { accountNumber, secret } = z
    .object({
      accountNumber: bankAccountSchema,
      secret: shortcutKeySchema,
    })
    .strict()
    .parse(raw);
  const ref = bankShortcutRef(uid);
  const keyHash = hash(secret);
  const sealedSession = sealSession(
    session,
    Buffer.from(secret, "hex"),
    context(ref.id),
  );
  return operation(
    uid,
    "bank-shortcut-connect",
    requestId,
    { accountNumber, keyHash },
    async (tx) => {
      tx.set(
        ref,
        connectionSchema.parse({
          accountNumber,
          keyHash,
          sealedSession,
          expiresAt: Timestamp.fromMillis(expiresAt),
          schemaVersion: 1,
        }),
      );
      return { id: ref.id };
    },
  );
}

export async function disconnectBankShortcut(uid: string, requestId: string) {
  const ref = bankShortcutRef(uid);
  return operation(
    uid,
    "bank-shortcut-disconnect",
    requestId,
    {},
    async (tx) => {
      tx.delete(ref);
      return { id: ref.id };
    },
  );
}

export async function verifyBankShortcut(authorization: string | null) {
  const match = /^Bearer ([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(
    authorization ?? "",
  );
  if (!match) throw unauthorized();
  const [, selector, secret] = match;
  const connection = connectionSchema.safeParse(
    (await connections().doc(selector).get()).data(),
  );
  const keyHash = hash(secret);
  if (
    !connection.success ||
    connection.data.expiresAt.toMillis() <= Date.now() ||
    !timingSafeEqual(Buffer.from(keyHash), Buffer.from(connection.data.keyHash))
  )
    throw unauthorized();
  const user = await (async () => {
    try {
      const session = openSealedSession(
        connection.data.sealedSession,
        Buffer.from(secret, "hex"),
        context(selector),
      );
      return await admin().auth.verifySessionCookie(session, true);
    } catch {
      throw unauthorized();
    }
  })();
  if (accountKey(user.uid) !== selector) throw unauthorized();
  await assertAccountAvailable(user.uid);
  return {
    uid: user.uid,
    keyHash,
    accountNumber: connection.data.accountNumber,
  };
}

export async function assertBankShortcutActive(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  keyHash: string,
) {
  const connection = connectionSchema.safeParse(
    (await tx.get(bankShortcutRef(uid))).data(),
  );
  if (
    !connection.success ||
    connection.data.expiresAt.toMillis() <= Date.now() ||
    connection.data.keyHash !== keyHash
  )
    throw unauthorized();
}
