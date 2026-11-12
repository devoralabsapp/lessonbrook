import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { sendStatementEmail } from "@/lib/server/statement-email";

const mocks = vi.hoisted(() => {
  const runTransaction = vi.fn();
  const collection = () => ({ doc: (id: string) => id });
  return { runTransaction, collection };
});

vi.mock("@/lib/firebase/admin", () => ({
  admin: () => ({ db: mocks }),
}));
vi.mock("@/lib/server/account-access", () => ({
  assertAccountWritable: vi.fn(),
}));
vi.mock("@/lib/server/session", () => ({
  appOrigin: () => "https://ledger.example.test",
}));
vi.mock("@/lib/server/repository", () => ({
  userRef: () => mocks,
  studentDto: () => ({ email: "guardian@example.test" }),
}));
vi.mock("@/lib/server/statements-repository", () => ({
  statementDto: () => ({
    id: "statement-a",
    activeShareTokenHash: "a".repeat(64),
    studentId: "student-a",
    status: "issued",
    number: "CC-2026-000001",
  }),
}));
vi.mock("@/lib/server/sharing-repository", () => ({
  tokenHash: () => "a".repeat(64),
}));

const teacher = {
  uid: "teacher-a",
  email: "teacher@example.test",
  email_verified: true,
};
const id = "statement-a";
const token = "b".repeat(43);
const input = { token, recipient: "guardian@example.test" };
const key = "d87e7fc4-ae5b-418d-8f53-4a6c0f122ad5";

function simulateShareToken() {
  const document = {
    ownerUid: teacher.uid,
    statementId: id,
    expiresAt: Timestamp.fromMillis(Date.now() + 60000),
    revokedAt: null,
    createdAt: Timestamp.now(),
    schemaVersion: 1,
    emailDelivery: undefined as
      | { requestId: string; attemptedAt: Timestamp; sentAt: Timestamp | null }
      | undefined,
  };
  const tokenDoc = {
    data: () => document,
    get: (key: string) =>
      document.emailDelivery?.[
        key.endsWith(".requestId") ? "requestId" : "sentAt"
      ],
  };
  mocks.runTransaction.mockImplementation(async (run) =>
    run({
      getAll: async () => [{}, tokenDoc],
      get: async () => tokenDoc,
      update: (
        _doc: string,
        patch: {
          emailDelivery?: typeof document.emailDelivery;
          "emailDelivery.sentAt"?: Timestamp;
        },
      ) => {
        if (patch.emailDelivery) document.emailDelivery = patch.emailDelivery;
        if (document.emailDelivery && patch["emailDelivery.sentAt"])
          document.emailDelivery.sentAt = patch["emailDelivery.sentAt"];
      },
    }),
  );
  return document;
}

beforeEach(() => {
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
  vi.stubEnv("STATEMENT_EMAIL_TEACHER", teacher.email);
  vi.stubEnv("STATEMENT_EMAIL_FROM", "sender@example.test");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_CLIENT_ID", "fake-client");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_CLIENT_SECRET", "fake-secret");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_REFRESH_TOKEN", "fake-refresh");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.runTransaction.mockReset();
});

it("emails the active link to the saved recipient once and rejects a changed recipient", async () => {
  const record = simulateShareToken();
  const gmail = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: "fake-access" }))
    .mockResolvedValueOnce(Response.json({ id: "fake-message-id" }));
  vi.stubGlobal("fetch", gmail);
  await expect(
    sendStatementEmail(
      teacher,
      id,
      { ...input, recipient: "other@example.test" },
      key,
      "en",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(gmail).not.toHaveBeenCalled();
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).resolves.toEqual({ id });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).resolves.toEqual({ id });
  expect(gmail).toHaveBeenCalledTimes(2);
  expect(record.emailDelivery?.sentAt).toBeInstanceOf(Timestamp);
  expect(gmail.mock.calls[1][0]).toBe(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  );
  const mime = Buffer.from(
    JSON.parse(gmail.mock.calls[1][1].body).raw,
    "base64url",
  ).toString();
  const [headers, body] = mime.split("\r\n\r\n");
  expect(headers).toContain("From: <sender@example.test>");
  expect(headers).toContain("To: <guardian@example.test>");
  expect(Buffer.from(body, "base64").toString()).toContain(
    `https://ledger.example.test/s#${token}`,
  );
  expect(JSON.stringify(record)).not.toContain(token);
  expect(JSON.stringify(record)).not.toContain(input.recipient);
});

it("keeps the delivery claim if Gmail might have accepted the request", async () => {
  const record = simulateShareToken();
  const gmail = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: "fake-access" }))
    .mockRejectedValueOnce(new Error("network timeout"));
  vi.stubGlobal("fetch", gmail);
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).rejects.toMatchObject({ status: 502 });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).rejects.toMatchObject({ status: 409 });
  expect(record.emailDelivery?.sentAt).toBeNull();
  expect(gmail).toHaveBeenCalledTimes(2);
});
