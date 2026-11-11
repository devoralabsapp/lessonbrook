import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { mobileProofSchema } from "@/domain/mobile-sign-in";
import { admin } from "@/lib/firebase/admin";
import { AppError } from "./errors";
import { openSealedSession, sealSession } from "./sealed-session";

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
    sealedSession: sealSession(session, key, challenge),
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
    const session = openSealedSession(
      parsed.data.sealedSession,
      Buffer.from(code, "base64url"),
      challenge,
    );
    transaction.delete(ref);
    return session;
  });
}
