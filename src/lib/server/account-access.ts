import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/firebase/admin";
import { idSchema } from "@/domain";
import { AppError } from "./errors";
import { assertMaintenanceInactive, maintenanceRef } from "./maintenance";
export const accountKey = (uid: string) =>
  createHash("sha256").update(idSchema.parse(uid)).digest("hex");
export const accountControlRef = (uid: string) =>
  admin().db.doc(`apps/chotcong/accountDeletions/${accountKey(uid)}`);
export async function accountBlocked(uid: string) {
  return (await accountControlRef(uid).get()).exists;
}
export function accountAccessRefs(uid: string) {
  return [maintenanceRef(), accountControlRef(uid)] as const;
}
export function assertAccountAccess(maintenance: boolean, blocked: boolean) {
  assertMaintenanceInactive(maintenance);
  if (blocked)
    throw new AppError(
      423,
      "Tài khoản đang được xóa hoặc đã xóa. Hãy mở trang tiến trình.",
    );
}
export async function assertAccountAvailable(uid: string) {
  const [maintenance, control] = await admin().db.getAll(
    ...accountAccessRefs(uid),
  );
  assertAccountAccess(maintenance.exists, control.exists);
}
export async function assertAccountWritable(
  tx: FirebaseFirestore.Transaction,
  uid: string,
) {
  const [maintenance, control] = await tx.getAll(...accountAccessRefs(uid));
  assertAccountAccess(maintenance.exists, control.exists);
}
