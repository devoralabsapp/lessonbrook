import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function sealSession(session: string, key: Buffer, context: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(session, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

export function openSealedSession(value: string, key: Buffer, context: string) {
  const sealed = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([
    decipher.update(sealed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
