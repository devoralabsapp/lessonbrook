import "server-only";
import type {
  DocumentReference,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import type { Statement } from "@/domain/statements";
import { AppError } from "./errors";

// Call after other transaction reads and before writing the statement.
export async function revokeActiveShare(
  tx: Transaction,
  root: DocumentReference,
  statement: Statement,
  now: Timestamp,
) {
  if (!statement.activeShareTokenHash) return {};
  const token = await tx.get(
    root.firestore.doc(
      `apps/chotcong/shareTokens/${statement.activeShareTokenHash}`,
    ),
  );
  if (token.exists) {
    if (
      token.get("ownerUid") !== root.id ||
      token.get("statementId") !== statement.id
    )
      throw new AppError(409, "Liên kết chia sẻ không khớp bảng kê.");
    tx.update(token.ref, { revokedAt: now });
  }
  return { activeShareTokenHash: null };
}
