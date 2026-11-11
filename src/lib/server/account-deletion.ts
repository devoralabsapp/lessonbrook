import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import { idSchema, requestIdSchema } from "@/domain";
import { deletionPhases, type DeletionStatus } from "@/domain/data";
import { accountControlRef, accountKey } from "./account-access";
import { userRef } from "./repository";
import { AppError } from "./errors";
import { assertServiceAvailable } from "./maintenance";
import { bankShortcutRef } from "./bank-shortcut";
export const DELETION_COOKIE = "chotcong_deletion";
export const DELETION_SECONDS = 7 * 86400;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const deletionJobSchema = z
  .object({
    ownerUid: idSchema.nullable(),
    phase: z.enum(deletionPhases),
    proofHash: z.string().regex(/^[a-f0-9]{64}$/),
    startRequestId: requestIdSchema.nullable(),
    leaseId: z.uuid().nullable(),
    leaseUntil: z.instanceof(Timestamp).nullable(),
    createdAt: z.instanceof(Timestamp),
    updatedAt: z.instanceof(Timestamp),
    completedAt: z.instanceof(Timestamp).nullable(),
    failedAt: z.instanceof(Timestamp).nullable(),
    schemaVersion: z.literal(1),
  })
  .strict();
type Job = z.infer<typeof deletionJobSchema>;
const jobRef = (id: string) => {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new AppError(401, "Hãy đăng nhập Google để tiếp tục yêu cầu xóa.");
  return admin().db.doc(`apps/chotcong/accountDeletions/${id}`);
};
function parseCookie(cookie: string | undefined) {
  const parts = cookie?.split(".");
  if (
    !parts ||
    parts.length !== 2 ||
    !/^[a-f0-9]{64}$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    throw new AppError(401, "Hãy đăng nhập Google để tiếp tục yêu cầu xóa.");
  return { id: parts[0], proofHash: hash(parts[1]) };
}
function verify(job: Job, proofHash: string) {
  if (!timingSafeEqual(Buffer.from(job.proofHash), Buffer.from(proofHash)))
    throw new AppError(401, "Hãy đăng nhập Google để tiếp tục yêu cầu xóa.");
}
const status = (job: Job): DeletionStatus => ({
  phase: job.phase,
  busy: Boolean(job.leaseUntil && job.leaseUntil.toMillis() > Date.now()),
  completedAt: job.completedAt?.toDate().toISOString() ?? null,
});
async function issueProof(uid: string, requestId?: string) {
  if (requestId) requestIdSchema.parse(requestId);
  const ref = accountControlRef(uid),
    token = randomBytes(32).toString("base64url"),
    proofHash = hash(token),
    now = Timestamp.now();
  await admin().db.runTransaction(async (tx) => {
    await assertServiceAvailable(tx);
    const existing = await tx.get(ref);
    if (existing.exists) {
      const job = deletionJobSchema.parse(existing.data());
      if (job.phase === "done" || job.ownerUid !== uid)
        throw new AppError(
          409,
          "Tài khoản cũ đã được xóa. Vui lòng đăng nhập Google lại.",
        );
      tx.update(ref, { proofHash, updatedAt: now });
    } else {
      if (!requestId)
        throw new AppError(404, "Không có yêu cầu xóa đang thực hiện.");
      if (!(await tx.get(userRef(uid))).exists)
        throw new AppError(404, "Không tìm thấy tài khoản.");
      tx.delete(bankShortcutRef(uid));
      tx.create(
        ref,
        deletionJobSchema.parse({
          ownerUid: uid,
          phase: "revoke",
          proofHash,
          startRequestId: requestId,
          leaseId: null,
          leaseUntil: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          failedAt: null,
          schemaVersion: 1,
        }),
      );
    }
  });
  return `${accountKey(uid)}.${token}`;
}
export const startDeletion = (uid: string, requestId: string) =>
  issueProof(uid, requestId);
export const resumeDeletion = (uid: string) => issueProof(uid);
export async function getDeletionStatus(cookie: string | undefined) {
  await assertServiceAvailable();
  const { id, proofHash } = parseCookie(cookie),
    doc = await jobRef(id).get();
  if (!doc.exists)
    throw new AppError(401, "Hãy đăng nhập Google để tiếp tục yêu cầu xóa.");
  const job = deletionJobSchema.parse(doc.data());
  verify(job, proofHash);
  return status(job);
}
const ignoreMissingUser = (error: unknown) => {
  if (!(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "auth/user-not-found"
  ))
    throw error;
};
export async function advanceDeletion(
  cookie: string | undefined,
): Promise<DeletionStatus> {
  const { id, proofHash } = parseCookie(cookie);
  return advanceJob(id, proofHash);
}
// Server/operator entry point only. No HTTP route accepts an operator flag or UID.
export async function advanceDeletionAsOperator(id: string) {
  return advanceJob(id);
}
async function advanceJob(
  id: string,
  proofHash?: string,
): Promise<DeletionStatus> {
  const ref = jobRef(id),
    leaseId = randomUUID(),
    now = Timestamp.now(),
    { db, auth } = admin();
  const claimed = await db.runTransaction(async (tx) => {
    await assertServiceAvailable(tx);
    const doc = await tx.get(ref);
    if (!doc.exists) throw new AppError(404, "Không tìm thấy yêu cầu xóa.");
    const job = deletionJobSchema.parse(doc.data());
    if (proofHash) verify(job, proofHash);
    if (
      job.phase === "done" ||
      (job.leaseUntil && job.leaseUntil.toMillis() > now.toMillis())
    )
      return { job, claimed: false };
    if (!job.ownerUid || accountKey(job.ownerUid) !== id)
      throw new Error("Deletion ownership invariant failed");
    tx.update(ref, {
      leaseId,
      leaseUntil: Timestamp.fromMillis(now.toMillis() + 120000),
      updatedAt: now,
    });
    return { job, claimed: true };
  });
  if (!claimed.claimed) return status(claimed.job);
  const uid = claimed.job.ownerUid!;
  let next = claimed.job.phase;
  try {
    if (next === "revoke") {
      await auth.revokeRefreshTokens(uid).catch(ignoreMissingUser);
      next = "shares";
    } else if (next === "shares") {
      const tokens = await db
        .collection("apps/chotcong/shareTokens")
        .where("ownerUid", "==", uid)
        .limit(100)
        .get();
      if (tokens.empty) next = "data";
      else {
        const batch = db.batch();
        tokens.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    } else if (next === "data") {
      // Official SDK walks all descendants, including subcollections with missing
      // parent documents. Repeating this after a timeout deletes what remains.
      await db.recursiveDelete(userRef(uid));
      next = "auth";
    } else if (next === "auth") {
      await auth.deleteUser(uid).catch(ignoreMissingUser);
      next = "done";
    }
    return await db.runTransaction(async (tx) => {
      const job = deletionJobSchema.parse((await tx.get(ref)).data());
      if (job.leaseId !== leaseId) return status(job);
      const update = {
        phase: next,
        leaseId: null,
        leaseUntil: null,
        failedAt: null,
        updatedAt: Timestamp.now(),
        ...(next === "done"
          ? {
              ownerUid: null,
              startRequestId: null,
              completedAt: Timestamp.now(),
            }
          : {}),
      };
      tx.update(ref, update);
      return status({ ...job, ...update });
    });
  } catch {
    await db
      .runTransaction(async (tx) => {
        const job = deletionJobSchema.parse((await tx.get(ref)).data());
        if (job.leaseId === leaseId)
          tx.update(ref, {
            leaseId: null,
            leaseUntil: null,
            failedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
      })
      .catch(() => {});
    console.error(
      JSON.stringify({
        event: "account.deletion.step-failed",
        phase: claimed.job.phase,
      }),
    );
    throw new AppError(
      503,
      "Chưa xóa xong. Trạng thái đã được giữ để bạn tiếp tục.",
    );
  }
}
