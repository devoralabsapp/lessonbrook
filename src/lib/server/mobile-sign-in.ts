import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { mobileProofSchema } from "@/domain/mobile-sign-in";
import { admin } from "@/lib/firebase/admin";
import { AppError } from "./errors";

const transferSchema = z.object({
  challenge: mobileProofSchema,
  sealedSession: z.string().min(38),
  expiresAt: z.instanceof(Timestamp),
  schemaVersion: z.literal(1),
});

const hash = (value: string) => createHash("sha256").update(value);
const transfers = () => admin().db.collection("apps/chotcong/mobileSignIns");

export async function issueMobileSignIn(session: string, challenge: string) {
  const key = randomBytes(32);
  const code = key.toString("base64url");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(challenge));
  const encrypted = Buffer.concat([
    cipher.update(session, "utf8"),
    cipher.final(),
  ]);
  const now = Timestamp.now();
  const collection = transfers();
  const expired = await collection
    .where("expiresAt", "<=", now)
    .limit(16)
    .get();
  const batch = admin().db.batch();
  for (const doc of expired.docs) batch.delete(doc.ref);
  batch.create(collection.doc(hash(code).digest("hex")), {
    challenge,
    sealedSession: Buffer.concat([
      nonce,
      cipher.getAuthTag(),
      encrypted,
    ]).toString("base64url"),
    expiresAt: Timestamp.fromMillis(now.toMillis() + 120_000),
    schemaVersion: 1,
  });
  await batch.commit();
  return code;
}

export async function redeemMobileSignIn(code: string, verifier: string) {
  const ref = transfers().doc(hash(code).digest("hex"));
  const challenge = hash(verifier).digest("base64url");
  return admin().db.runTransaction(async (transaction) => {
    const parsed = transferSchema.safeParse(
      (await transaction.get(ref)).data(),
    );
    if (
      !parsed.success ||
      parsed.data.expiresAt.toMillis() <= Date.now() ||
      parsed.data.challenge !== challenge
    ) {
      throw new AppError(
        401,
        "Phiên đăng nhập trên ứng dụng đã hết hạn. Vui lòng thử lại.",
      );
    }
    const sealed = Buffer.from(parsed.data.sealedSession, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(code, "base64url"),
      sealed.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(challenge));
    decipher.setAuthTag(sealed.subarray(12, 28));
    const session = Buffer.concat([
      decipher.update(sealed.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    transaction.delete(ref);
    return session;
  });
}
