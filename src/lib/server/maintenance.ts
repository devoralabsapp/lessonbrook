import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase/admin";
import { AppError } from "./errors";

// Durable, fail-closed operator switch. No browser/API can create or clear it.
// Transactions read this same document so pausing conflicts with in-flight writes.
export const maintenanceRef = (db: Firestore = admin().db) =>
  db.doc("apps/chotcong/operations/maintenance");
export function assertMaintenanceInactive(active: boolean) {
  if (active)
    throw new AppError(
      503,
      "Hệ thống đang bảo trì dữ liệu. Nội dung đã nhập vẫn được giữ; vui lòng thử lại sau.",
    );
}
export async function assertServiceAvailable(tx?: Transaction) {
  const ref = maintenanceRef();
  assertMaintenanceInactive((await (tx ? tx.get(ref) : ref.get())).exists);
}
