import "server-only";
import { createHash } from "node:crypto";
import {
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema } from "@/domain";
import { AppError } from "./errors";

const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    value: z.union([
      z.string().max(100),
      z
        .object({
          seconds: z.number().int().min(-62135596800).max(253402300799),
          nanoseconds: z.number().int().min(0).max(999999999),
        })
        .strict(),
    ]),
    id: idSchema,
  })
  .strict();
export const MAX_SCAN_DOCUMENTS = 200;
export const listScope = (uid: string, resource: string, filters: unknown) =>
  createHash("sha256")
    .update(JSON.stringify([uid, resource, filters]))
    .digest("hex");

// Filtering scans at most 200 records/request. Continuation points to the last
// examined record, including on empty result pages; it never skips unread hits.
// Only the caller supplies collection/order/UID. A cursor grants no access.
export async function listPage<T>(options: {
  query: Query;
  orderField: string;
  scope: string;
  cursor?: string;
  limit: number;
  dto: (doc: QueryDocumentSnapshot) => T;
  enrich?: (items: T[]) => Promise<T[]>;
  matches?: (item: T) => boolean;
}) {
  let query = options.query;
  if (options.cursor) {
    if (options.cursor.length > 1000)
      throw new AppError(400, "Trang dữ liệu không hợp lệ.");
    let raw: unknown;
    try {
      raw = JSON.parse(
        Buffer.from(options.cursor, "base64url").toString("utf8"),
      );
    } catch {
      throw new AppError(400, "Trang dữ liệu không hợp lệ.");
    }
    const cursor = cursorSchema.parse(raw);
    if (cursor.scope !== options.scope)
      throw new AppError(400, "Bộ lọc đã thay đổi. Vui lòng tìm lại từ đầu.");
    const value =
      typeof cursor.value === "string"
        ? cursor.value
        : new Timestamp(cursor.value.seconds, cursor.value.nanoseconds);
    query = query.startAfter(value, cursor.id);
  }
  const encodeCursor = (doc: QueryDocumentSnapshot) => {
    const value = doc.get(options.orderField);
    return Buffer.from(
      JSON.stringify({
        version: 1,
        scope: options.scope,
        value:
          value instanceof Timestamp
            ? { seconds: value.seconds, nanoseconds: value.nanoseconds }
            : value,
        id: doc.id,
      }),
    ).toString("base64url");
  };
  const items: T[] = [];
  let scanned = 0;
  while (scanned < MAX_SCAN_DOCUMENTS) {
    const size = Math.min(
      options.matches ? 50 : options.limit,
      MAX_SCAN_DOCUMENTS - scanned,
    );
    const docs = (await query.limit(size + 1).get()).docs;
    const batch = docs.slice(0, size);
    const enriched = options.enrich
      ? await options.enrich(batch.map(options.dto))
      : undefined;
    for (let index = 0; index < batch.length; index++) {
      const doc = batch[index],
        item = enriched?.[index] ?? options.dto(doc);
      scanned++;
      if (!options.matches || options.matches(item)) items.push(item);
      if (items.length === options.limit)
        return {
          items,
          nextCursor: index + 1 < docs.length ? encodeCursor(doc) : null,
        };
    }
    const last = batch.at(-1);
    if (!last || docs.length <= size) return { items, nextCursor: null };
    if (scanned === MAX_SCAN_DOCUMENTS)
      return { items, nextCursor: encodeCursor(last) };
    query = query.startAfter(last);
  }
  throw new Error("List scan invariant failed");
}
