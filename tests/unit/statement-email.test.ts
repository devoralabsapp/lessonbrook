import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { sendStatementEmail } from "@/lib/server/statement-email";

const mocks = vi.hoisted(() => {
  const runTransaction = vi.fn();
  const createTransport = vi.fn();
  const collection = () => ({ doc: (id: string) => id });
  return { runTransaction, collection, createTransport };
});

vi.mock("nodemailer", () => ({ createTransport: mocks.createTransport }));

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
    teacherSnapshot: { displayName: "Demo Teacher" },
    recipientSnapshot: { displayName: "Alex Rivera" },
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    issueDate: "2026-11-13",
    dueDate: "2026-11-20",
    totalVnd: 400000,
    paidVnd: 100000,
    bankTransferSnapshot: {
      bankBin: "970436",
      bankName: "Example Bank",
      accountNumber: "1234567890",
      accountName: "Demo Teacher",
    },
    items: [
      { sessionId: "session-1", sessionDate: "2026-11-02", amountVnd: 200000 },
      { sessionId: "session-2", sessionDate: "2026-11-09", amountVnd: 200000 },
    ],
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
  vi.stubEnv("STATEMENT_EMAIL_TEACHER_WHITELIST", undefined);
  vi.stubEnv("STATEMENT_EMAIL_GMAIL_APP_PASSWORD", "");
  vi.stubEnv("STATEMENT_EMAIL_FROM", "sender@example.test");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_CLIENT_ID", "fake-client");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_CLIENT_SECRET", "fake-secret");
  vi.stubEnv("STATEMENT_EMAIL_GOOGLE_REFRESH_TOKEN", "fake-refresh");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.runTransaction.mockReset();
  mocks.createTransport.mockReset();
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
  expect(mime).toContain("From: LessonBrook <sender@example.test>");
  expect(mime).toContain("To: guardian@example.test");
  expect(mime).toContain("Content-Type: multipart/alternative;");
  expect(mime).toContain("Content-Type: multipart/related;");
  const plainPart = mime.match(
    /Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/,
  );
  const htmlPart = mime.match(
    /Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/,
  );
  expect(plainPart).not.toBeNull();
  expect(htmlPart).not.toBeNull();
  expect(Buffer.from(plainPart![1], "base64").toString()).toContain(
    `https://ledger.example.test/s#${token}`,
  );
  expect(Buffer.from(htmlPart![1], "base64").toString()).toContain(
    "Your tuition statement",
  );
  const cid = mime.match(/Content-ID: <([^>]+)>/)?.[1];
  expect(cid).toBeTruthy();
  expect(mime).toContain("Content-Type: image/png;");
  expect(Buffer.from(htmlPart![1], "base64").toString()).toContain(
    `src="cid:${cid}"`,
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

it("uses Gmail TLS and sends the statement once with an app password", async () => {
  const record = simulateShareToken();
  vi.stubEnv("STATEMENT_EMAIL_GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
  const sendMail = vi.fn().mockResolvedValue({});
  mocks.createTransport.mockReturnValue({ sendMail });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).resolves.toEqual({ id });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).resolves.toEqual({ id });
  expect(mocks.createTransport).toHaveBeenCalledOnce();
  expect(mocks.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "sender@example.test", pass: "abcdefghijklmnop" },
    }),
  );
  expect(sendMail).toHaveBeenCalledOnce();
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: { name: "", address: "guardian@example.test" },
      text: expect.stringContaining(`https://ledger.example.test/s#${token}`),
      html: expect.stringContaining('href="https://ledger.example.test/s#'),
      subject: "Tuition statement CC-2026-000001 · Alex Rivera",
      attachments: [expect.objectContaining({ contentType: "image/png" })],
    }),
  );
  expect(record.emailDelivery?.sentAt).toBeInstanceOf(Timestamp);
});

it("preserves the send claim on an ambiguous SMTP disconnect", async () => {
  const record = simulateShareToken();
  vi.stubEnv("STATEMENT_EMAIL_GMAIL_APP_PASSWORD", "abcdefghijklmnop");
  const sendMail = vi.fn().mockRejectedValue(
    Object.assign(new Error("Connection closed unexpectedly"), {
      code: "ECONNECTION",
      command: "CONN",
    }),
  );
  mocks.createTransport.mockReturnValue({ sendMail });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).rejects.toMatchObject({ status: 502 });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).rejects.toMatchObject({ status: 409 });
  expect(sendMail).toHaveBeenCalledOnce();
  expect(record.emailDelivery?.sentAt).toBeNull();
});

it("allows verified teachers listed by exact email and overrides the legacy teacher setting", async () => {
  simulateShareToken();
  vi.stubEnv("STATEMENT_EMAIL_TEACHER", "old@example.test");
  vi.stubEnv(
    "STATEMENT_EMAIL_TEACHER_WHITELIST",
    " other@example.test, TEACHER@example.test\nlast@example.test ",
  );
  vi.stubEnv("STATEMENT_EMAIL_GMAIL_APP_PASSWORD", "abcdefghijklmnop");
  const sendMail = vi.fn().mockResolvedValue({});
  mocks.createTransport.mockReturnValue({ sendMail });
  await expect(
    sendStatementEmail(teacher, id, input, key, "en"),
  ).resolves.toEqual({ id });
  expect(sendMail).toHaveBeenCalledOnce();
});

it.each([
  "",
  "other@example.test",
  "*@example.test",
  "prefix-teacher@example.test",
  "teacher@example.test.evil.test",
])(
  "rejects a teacher outside the configured whitelist %j before any reads or delivery",
  async (whitelist) => {
    vi.stubEnv("STATEMENT_EMAIL_TEACHER_WHITELIST", whitelist);
    await expect(
      sendStatementEmail(teacher, id, input, key, "en"),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.runTransaction).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  },
);

it("requires verified email even when the account is whitelisted", async () => {
  vi.stubEnv("STATEMENT_EMAIL_TEACHER_WHITELIST", teacher.email);
  await expect(
    sendStatementEmail(
      { ...teacher, email_verified: false },
      id,
      input,
      key,
      "en",
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(mocks.runTransaction).not.toHaveBeenCalled();
});
