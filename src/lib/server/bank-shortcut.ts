import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  bankAccountSchema,
  shortcutKeySchema,
} from "@/domain/bank-notification";
import type { Statement } from "@/domain/statements";
import { MAX_TRANSFER_MEMO_LENGTH } from "@/domain/bank-transfer";
import { admin } from "@/lib/firebase/admin";
import { accountKey, assertAccountAvailable } from "./account-access";
import { AppError } from "./errors";
import { operation } from "./repository";
import { refreshFirebaseToken } from "./firebase-refresh";
import { SESSION_SECONDS } from "./session";
import { openSealedSession, sealSession } from "./sealed-session";

const connectionFields = {
  accountNumber: bankAccountSchema,
  keyHash: shortcutKeySchema,
  sealedSession: z.string().min(38),
  expiresAt: z.instanceof(Timestamp),
};
const renewableSchema = z
  .object({
    ...connectionFields,
    sealedRefreshToken: z.string().min(38),
    schemaVersion: z.literal(2),
  })
  .strict();
const connectionSchema = z.discriminatedUnion("schemaVersion", [
  z.object({ ...connectionFields, schemaVersion: z.literal(1) }).strict(),
  renewableSchema,
]);
type RenewableConnection = z.infer<typeof renewableSchema>;
const refreshTokenSchema = z.string().min(1).max(8192);
const connections = () => admin().db.collection("apps/chotcong/bankShortcuts");
export const bankShortcutRef = (uid: string) =>
  connections().doc(accountKey(uid));
const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const unauthorized = () =>
  new AppError(401, "Kết nối Phím tắt không hợp lệ hoặc đã hết hạn.");
const context = (selector: string) => `bank-shortcut:${selector}`;
export function transferReferenceFor(
  statement: Pick<Statement, "number" | "id" | "bankTransferSnapshot">,
) {
  if (!statement.number) return null;
  const suffixLength = statement.bankTransferSnapshot
    ? MAX_TRANSFER_MEMO_LENGTH - statement.number.length - 1
    : 12;
  return `${statement.number}-${hash(statement.id).slice(0, suffixLength).toUpperCase()}`;
}

export async function getBankShortcut(uid: string) {
  const doc = await bankShortcutRef(uid).get();
  if (!doc.exists) return null;
  const connection = connectionSchema.parse(doc.data());
  return {
    accountLast4: connection.accountNumber.slice(-4),
    renewable: connection.schemaVersion === 2,
    expiresAt:
      connection.schemaVersion === 1
        ? connection.expiresAt.toDate().toISOString()
        : null,
  };
}

async function createRenewableSession(
  selector: string,
  secret: string,
  refreshToken: string,
  freshSignIn: boolean,
) {
  const invalid = freshSignIn
    ? new AppError(
        403,
        "Xác nhận lại bằng đúng tài khoản Google của LessonBrook.",
      )
    : unauthorized();
  const refreshed = await refreshFirebaseToken(refreshToken);
  if (!refreshed) throw invalid;
  const { auth } = admin();
  const user = await auth.verifyIdToken(refreshed.idToken, true).catch(() => {
    throw invalid;
  });
  const age = Date.now() / 1000 - user.auth_time;
  if (
    accountKey(user.uid) !== selector ||
    user.firebase.sign_in_provider !== "google.com" ||
    (freshSignIn && (age < -30 || age > 300))
  )
    throw invalid;

  const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_SECONDS * 1000);
  const session = await auth.createSessionCookie(refreshed.idToken, {
    expiresIn: SESSION_SECONDS * 1000,
  });
  const key = Buffer.from(secret, "hex");
  return {
    sealedSession: sealSession(session, key, context(selector)),
    sealedRefreshToken: sealSession(
      refreshed.refreshToken,
      key,
      `${context(selector)}:refresh`,
    ),
    expiresAt,
    schemaVersion: 2 as const,
  };
}

export async function connectBankShortcut(
  uid: string,
  session: string,
  expiresAt: number,
  raw: unknown,
  requestId: string,
) {
  const { accountNumber, secret, refreshToken } = z
    .object({
      accountNumber: bankAccountSchema,
      secret: shortcutKeySchema,
      refreshToken: refreshTokenSchema.optional(),
    })
    .strict()
    .parse(raw);
  const ref = bankShortcutRef(uid);
  const keyHash = hash(secret);
  const credentials = refreshToken
    ? await createRenewableSession(ref.id, secret, refreshToken, true)
    : {
        sealedSession: sealSession(
          session,
          Buffer.from(secret, "hex"),
          context(ref.id),
        ),
        expiresAt: Timestamp.fromMillis(expiresAt),
        schemaVersion: 1 as const,
      };
  return operation(
    uid,
    "bank-shortcut-connect",
    requestId,
    { accountNumber, keyHash, ...(refreshToken ? { renewable: true } : {}) },
    async (tx) => {
      tx.set(
        ref,
        connectionSchema.parse({ accountNumber, keyHash, ...credentials }),
      );
      return { id: ref.id };
    },
  );
}

export async function upgradeBankShortcut(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const { secret, refreshToken } = z
    .object({
      secret: shortcutKeySchema,
      refreshToken: refreshTokenSchema,
    })
    .strict()
    .parse(raw);
  const ref = bankShortcutRef(uid);
  const keyHash = hash(secret);
  const credentials = await createRenewableSession(
    ref.id,
    secret,
    refreshToken,
    true,
  );
  return operation(
    uid,
    "bank-shortcut-upgrade",
    requestId,
    { keyHash },
    async (tx) => {
      const previous = connectionSchema.safeParse((await tx.get(ref)).data());
      if (!previous.success || previous.data.keyHash !== keyHash)
        throw new AppError(
          403,
          "Khóa không khớp với kết nối Phím tắt hiện tại.",
        );
      tx.set(
        ref,
        renewableSchema.parse({
          accountNumber: previous.data.accountNumber,
          keyHash,
          ...credentials,
        }),
      );
      return { id: ref.id };
    },
  );
}

async function renewBankShortcut(
  ref: FirebaseFirestore.DocumentReference,
  connection: RenewableConnection,
  secret: string,
) {
  const refreshToken = openSealedSession(
    connection.sealedRefreshToken,
    Buffer.from(secret, "hex"),
    `${context(ref.id)}:refresh`,
  );
  const renewed = await createRenewableSession(
    ref.id,
    secret,
    refreshToken,
    false,
  ).catch(async (error) => {
    // Another request can already have exchanged the same refresh token.
    if (!(error instanceof AppError) || error.status !== 401) throw error;
    const latest = renewableSchema.safeParse((await ref.get()).data());
    if (
      !latest.success ||
      latest.data.keyHash !== connection.keyHash ||
      latest.data.expiresAt.toMillis() <= Date.now()
    )
      throw error;
    return latest.data;
  });
  return admin().db.runTransaction(async (tx) => {
    const current = renewableSchema.safeParse((await tx.get(ref)).data());
    if (!current.success || current.data.keyHash !== connection.keyHash)
      throw unauthorized();
    if (current.data.sealedRefreshToken !== connection.sealedRefreshToken) {
      if (current.data.expiresAt.toMillis() <= Date.now()) throw unauthorized();
      return current.data;
    }
    const updated = { ...current.data, ...renewed };
    tx.set(ref, updated);
    return updated;
  });
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
  const ref = connections().doc(selector);
  const stored = connectionSchema.safeParse((await ref.get()).data());
  const keyHash = hash(secret);
  if (
    !stored.success ||
    !timingSafeEqual(Buffer.from(keyHash), Buffer.from(stored.data.keyHash))
  )
    throw unauthorized();
  let connection = stored.data;
  if (connection.expiresAt.toMillis() <= Date.now()) {
    if (connection.schemaVersion !== 2) throw unauthorized();
    connection = await renewBankShortcut(ref, connection, secret);
  }
  const session = openSealedSession(
    connection.sealedSession,
    Buffer.from(secret, "hex"),
    context(selector),
  );
  const user = await admin()
    .auth.verifySessionCookie(session, true)
    .catch(() => {
      throw unauthorized();
    });
  if (accountKey(user.uid) !== selector) throw unauthorized();
  await assertAccountAvailable(user.uid);
  return { uid: user.uid, keyHash, accountNumber: connection.accountNumber };
}

export async function assertBankShortcutActive(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  keyHash: string,
  accountNumber: string,
) {
  const connection = connectionSchema.safeParse(
    (await tx.get(bankShortcutRef(uid))).data(),
  );
  if (
    !connection.success ||
    connection.data.expiresAt.toMillis() <= Date.now() ||
    connection.data.keyHash !== keyHash ||
    connection.data.accountNumber !== accountNumber
  )
    throw unauthorized();
}
