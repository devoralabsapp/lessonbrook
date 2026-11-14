import "server-only";
import {
  FieldValue,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema, vietnamToday } from "@/domain";
import { admin } from "@/lib/firebase/admin";
import { accountAccessRefs, assertAccountAccess } from "./account-access";
import { verifyUserSession } from "./session";

type DataGroup =
  | "profile"
  | "appearance"
  | "students"
  | "classes"
  | "lessons"
  | "statements"
  | "payments";

const readGroups = {
  profile: ["profile"],
  appearance: ["appearance"],
  onboarding: ["profile", "students", "lessons"],
  students: ["students"],
  student: ["students"],
  classes: ["classes"],
  class: ["classes", "students"],
  lessons: ["lessons", "classes"],
  lesson: ["lessons", "statements"],
  sessions: ["lessons", "statements", "students"],
  session: ["lessons", "statements"],
  statements: ["statements", "students"],
  statement: ["statements"],
  eligible: ["lessons", "statements", "students"],
  payments: ["payments", "statements"],
  summary: ["students", "lessons", "statements", "payments"],
  schedule: ["classes", "lessons"],
} as const satisfies Record<string, readonly DataGroup[]>;

const writeGroups = {
  "profile-update": ["profile"],
  "bank-transfer-settings": ["profile"],
  "onboarding-profile": ["profile"],
  "appearance-update": ["appearance"],
  "student-create": ["students"],
  "student-update": ["students"],
  "student-archive": ["students"],
  "class-create": ["classes"],
  "class-update": ["classes"],
  "class-archive": ["classes"],
  "session-create": ["lessons"],
  "session-update": ["lessons"],
  "sessions-complete": ["lessons"],
  "lesson-create": ["lessons"],
  "lesson-update": ["lessons"],
  "statement-create": ["statements"],
  "statement-update": ["statements"],
  "statement-issue": ["statements", "lessons"],
  "statement-create-issued": ["statements", "lessons"],
  "statement-amend": ["statements", "lessons"],
  "statement-void": ["statements", "lessons"],
  "share-revoke": ["statements"],
  "payment-create": ["payments", "statements"],
  "payment-edit": ["payments", "statements"],
  "payment-void": ["payments", "statements"],
  "bank-transfer": ["payments", "statements"],
  "bank-shortcut-connect": [],
  "bank-shortcut-upgrade": [],
  "bank-shortcut-disconnect": [],
  "data-export": [],
} as const satisfies Record<string, readonly DataGroup[]>;

export type WorkspaceOperation = keyof typeof writeGroups;

export function markWorkspaceChanged(
  tx: Transaction,
  root: DocumentReference,
  revision: string,
  groups: readonly DataGroup[],
) {
  // The revision becomes visible with the data at the same commit.
  if (groups.length)
    tx.set(
      root.collection("preferences").doc("workspace-cache"),
      {
        schemaVersion: 1,
        updatedAt: FieldValue.serverTimestamp(),
        revisions: Object.fromEntries(groups.map((group) => [group, revision])),
      },
      { merge: true },
    );
}

export function markOperationChanged(
  tx: Transaction,
  root: DocumentReference,
  revision: string,
  operation: WorkspaceOperation,
) {
  markWorkspaceChanged(tx, root, revision, writeGroups[operation]);
}

const revisionsSchema = z.object({
  schemaVersion: z.literal(1),
  revisions: z.record(z.string(), z.uuid()),
});

const ttlMs = 45_000;
const maxEntries = 256;
const maxValueBytes = 128 * 1024;
const entries = new Map<string, { expiresAt: number; json: string }>();
const pending = new Map<string, Promise<unknown>>();

export async function readThroughWorkspaceCache<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  for (const [cachedKey, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(cachedKey);
  }
  const entry = entries.get(key);
  if (entry) {
    entries.delete(key);
    entries.set(key, entry);
    return JSON.parse(entry.json) as T;
  }
  const existing = pending.get(key);
  if (existing) return (await existing) as T;
  if (pending.size >= maxEntries) return load();
  const loading = Promise.resolve().then(load);
  pending.set(key, loading);
  try {
    const value = await loading;
    const json = JSON.stringify(value);
    if (json !== undefined && Buffer.byteLength(json) <= maxValueBytes) {
      entries.set(key, { expiresAt: now + ttlMs, json });
      if (entries.size > maxEntries)
        entries.delete(entries.keys().next().value!);
    }
    return value;
  } finally {
    pending.delete(key);
  }
}

export type WorkspaceRead = <T>(
  kind: keyof typeof readGroups,
  identity: readonly (string | Record<string, string> | undefined)[],
  load: () => Promise<T>,
) => Promise<T>;

export async function workspaceReader(uid: string): Promise<WorkspaceRead> {
  const { db } = admin();
  const [maintenance, control, versions] = await db.getAll(
    ...accountAccessRefs(uid),
    db.doc(
      `apps/chotcong/users/${idSchema.parse(uid)}/preferences/workspace-cache`,
    ),
  );
  assertAccountAccess(maintenance.exists, control.exists);
  const parsed = revisionsSchema.safeParse(versions.data());
  if (versions.exists && !parsed.success)
    return (_kind, _identity, load) => load();
  const revisions = parsed.success ? parsed.data.revisions : {};
  const now = new Date();
  const today = vietnamToday(now);
  return (kind, identity, load) => {
    const filters = identity.map((part) =>
      part && typeof part === "object" ? Object.entries(part).sort() : part,
    );
    const minute =
      kind === "classes" ? Math.floor(now.getTime() / 60_000) : null;
    const key = JSON.stringify([
      process.env.FIREBASE_PROJECT_ID,
      db.databaseId,
      uid,
      kind,
      today,
      minute,
      filters,
      readGroups[kind].map((group) => revisions[group] ?? null),
    ]);
    return readThroughWorkspaceCache(key, load);
  };
}

export async function requireWorkspaceReader() {
  const { uid } = await verifyUserSession();
  return { uid, read: await workspaceReader(uid) };
}
