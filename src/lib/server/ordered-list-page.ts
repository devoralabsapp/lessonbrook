import "server-only";
import { z } from "zod";
import { idSchema } from "@/domain";
import { compareRecordKeys } from "@/domain/record-order";
import { AppError } from "./errors";

const cursorSchema = z
  .object({
    version: z.literal(2),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    at: z.iso.datetime(),
    key: z.array(z.string().max(200)).min(2).max(3),
    id: idSchema,
  })
  .strict();

// Locale collation and recurring timetables are computed before pagination.
// No stored sort field is required, so records made by older versions stay visible.
export async function orderedListPage<T extends { id: string }>(options: {
  read: () => Promise<T[]>;
  key: (item: T, at: Date) => string[];
  scope: string;
  cursor?: string;
  limit: number;
}) {
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (options.cursor) {
    try {
      if (options.cursor.length > 2000) throw new Error("cursor length");
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new AppError(400, "Trang dữ liệu không hợp lệ.");
    }
    if (cursor.scope !== options.scope)
      throw new AppError(400, "Bộ lọc đã thay đổi. Vui lòng tìm lại từ đầu.");
  }
  // Keep one reference time across every page, including a weekly slot becoming due.
  const at = cursor?.at ?? new Date().toISOString();
  const reference = new Date(at);
  const records = (await options.read())
    .map((item) => ({ item, key: options.key(item, reference) }))
    .filter(({ key }) => !cursor || compareRecordKeys(key, cursor.key) > 0)
    .sort((a, b) => compareRecordKeys(a.key, b.key));
  const selected = records.slice(0, options.limit);
  const last = selected.at(-1);
  return {
    items: selected.map(({ item }) => item),
    nextCursor:
      last && records.length > selected.length
        ? Buffer.from(
            JSON.stringify({
              version: 2,
              scope: options.scope,
              at,
              key: last.key,
              id: last.item.id,
            }),
          ).toString("base64url")
        : null,
  };
}

// Read the earliest date window through the existing descending date index.
// Complete its boundary day before sorting by time, so equal-date rows are
// never split by random document IDs across pages. Large ledgers stay bounded
// by the scanned window plus the two boundary days.
export async function chronologicalListPage<
  T extends { id: string; sessionDate: string; startTime: string | null },
>(options: {
  query: import("firebase-admin/firestore").Query;
  scope: string;
  cursor?: string;
  limit: number;
  dto: (doc: import("firebase-admin/firestore").QueryDocumentSnapshot) => T;
  matches: (item: T) => boolean;
  enrich?: (items: T[]) => Promise<T[]>;
}) {
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (options.cursor) {
    try {
      if (options.cursor.length > 2000) throw new Error("cursor length");
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new AppError(400, "Trang dữ liệu không hợp lệ.");
    }
    if (cursor.scope !== options.scope)
      throw new AppError(400, "Bộ lọc đã thay đổi. Vui lòng tìm lại từ đầu.");
  }
  const at = cursor?.at ?? new Date().toISOString();
  const date = cursor?.key[0];
  const nextDates = date
    ? options.query.where("sessionDate", ">", date)
    : options.query;
  const [window, boundary] = await Promise.all([
    nextDates.limitToLast(201).get(),
    date ? options.query.where("sessionDate", "==", date).get() : null,
  ]);
  const docs = new Map((boundary?.docs ?? []).map((doc) => [doc.id, doc]));
  for (const doc of window.docs.slice(-200)) docs.set(doc.id, doc);
  if (window.size === 201) {
    const lastDate = window.docs.at(-200)!.get("sessionDate");
    const completeDay = await options.query
      .where("sessionDate", "==", lastDate)
      .get();
    for (const doc of completeDay.docs) docs.set(doc.id, doc);
  }
  const records = [...docs.values()].map(options.dto);
  const enriched = options.enrich ? await options.enrich(records) : records;
  const ordered = enriched
    .map((item) => ({
      item,
      key: [item.sessionDate, item.startTime ?? "24:00", item.id],
    }))
    .filter(({ key }) => !cursor || compareRecordKeys(key, cursor.key) > 0)
    .sort((a, b) => compareRecordKeys(a.key, b.key));
  const matching = ordered.filter(({ item }) => options.matches(item));
  const selected = matching.slice(0, options.limit);
  const last =
    selected.length === options.limit ? selected.at(-1) : ordered.at(-1);
  const more = matching.length > selected.length || window.size === 201;
  return {
    items: selected.map(({ item }) => item),
    nextCursor:
      more && last
        ? Buffer.from(
            JSON.stringify({
              version: 2,
              scope: options.scope,
              at,
              key: last.key,
              id: last.item.id,
            }),
          ).toString("base64url")
        : null,
  };
}
