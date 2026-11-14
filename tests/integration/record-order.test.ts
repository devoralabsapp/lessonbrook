import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { compareRecordKeys, lessonOrderKey } from "@/domain/record-order";
import { client, googleToken } from "./helpers";

let teacher: Awaited<ReturnType<typeof client>>,
  other: Awaited<ReturnType<typeof client>>,
  uid: string;
beforeAll(async () => {
  teacher = await client();
  other = await client();
  const a = await googleToken(),
    b = await googleToken();
  uid = a.uid;
  await teacher.login(a.idToken);
  await other.login(b.idToken);
});
it("orders complete days across page boundaries, filters and cursor scopes", async () => {
  const db = admin().db,
    root = db.doc(`apps/chotcong/users/${uid}`),
    now = Timestamp.now();
  const studentId = randomUUID();
  await root.collection("students").doc(studentId).set({
    displayName: "Test",
    defaultRateVnd: 200000,
    contactName: "",
    phone: "",
    privateNote: "",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  });
  const batch = db.batch(),
    rows = [];
  for (let n = 0; n < 215; n++) {
    const record = {
      id: randomUUID(),
      studentId,
      studentName: "Test",
      sessionDate: n < 207 ? "2026-11-14" : "2026-11-15",
      startTime:
        n === 0
          ? null
          : `${String(Math.floor((214 - n) / 60)).padStart(2, "0")}:${String((214 - n) % 60).padStart(2, "0")}`,
      durationMinutes: null,
      rateVnd: 200000,
      status: n % 2 ? "planned" : "completed",
      billable: true,
      amountVnd: n % 2 ? 0 : 200000,
      billedStatementId: null,
      privateNote: "",
      requestId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };
    const { id, ...data } = record;
    batch.create(root.collection("sessions").doc(id), data);
    rows.push(record);
  }
  await batch.commit();
  const expected = rows.sort((a, b) =>
    compareRecordKeys(lessonOrderKey(a), lessonOrderKey(b)),
  );
  const seen: string[] = [];
  let cursor: string | null = null,
    firstCursor = "";
  do {
    const response = await teacher.call(
      `/api/sessions?order=chronological&limit=19${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const page = await response.json();
    seen.push(...page.items.map((item: { id: string }) => item.id));
    cursor = page.nextCursor;
    firstCursor ||= cursor ?? "";
    expect(seen.length).toBeLessThanOrEqual(215);
  } while (cursor);
  expect(seen).toEqual(expected.map((s) => s.id));
  expect(
    (
      await teacher.call(
        `/api/sessions?order=chronological&status=planned&cursor=${encodeURIComponent(firstCursor)}`,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await other.call(
        `/api/sessions?order=chronological&cursor=${encodeURIComponent(firstCursor)}`,
      )
    ).status,
  ).toBe(400);
  const filtered = await (
    await teacher.call(
      `/api/sessions?order=chronological&studentId=${studentId}&status=planned&limit=50`,
    )
  ).json();
  expect(filtered.items.map((s: { id: string }) => s.id)).toEqual(
    expected
      .filter((s) => s.status === "planned")
      .slice(0, 50)
      .map((s) => s.id),
  );
});
it("sorts active and archived students alphabetically before taking a page", async () => {
  const root = admin().db.doc(`apps/chotcong/users/${uid}`),
    now = Timestamp.now();
  const names = ["Đan", "Ân", "Bình", "an", "Duy", "Ăn"];
  for (const displayName of names)
    await root.collection("students").doc(randomUUID()).set({
      displayName,
      defaultRateVnd: 0,
      contactName: "",
      phone: "",
      privateNote: "",
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    });
  let cursor: string | null = null;
  const namesSeen: string[] = [];
  do {
    const r = await teacher.call(
      `/api/students?order=name&archived=true&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    expect(r.status).toBe(200);
    const p = await r.json();
    namesSeen.push(
      ...p.items.map((s: { displayName: string }) => s.displayName),
    );
    cursor = p.nextCursor;
  } while (cursor);
  expect(namesSeen).toEqual(["an", "Ăn", "Ân", "Bình", "Duy", "Đan"]);
});
it("orders class pages by upcoming slots and retains legacy unscheduled classes", async () => {
  const db = admin().db,
    root = db.doc(`apps/chotcong/users/${uid}`),
    now = Timestamp.now();
  const student = (await root.collection("students").limit(1).get()).docs[0].id;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const tomorrow = (weekday % 7) + 1,
    afterTomorrow = (tomorrow % 7) + 1;
  const fixtures = [
    {
      displayName: "A Later",
      weeklySchedule: [{ weekday: tomorrow, time: "18:00" }],
    },
    {
      displayName: "Z Earlier",
      weeklySchedule: [{ weekday: tomorrow, time: "08:00" }],
    },
    {
      displayName: "B Next day",
      weeklySchedule: [{ weekday: afterTomorrow, time: "08:00" }],
    },
    { displayName: "C No timetable" },
  ];
  for (const row of fixtures)
    await root
      .collection("classes")
      .doc(randomUUID())
      .set({
        ...row,
        studentIds: [student],
        rateVnd: 0,
        privateNote: "",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
      });
  let cursor: string | null = null;
  const names: string[] = [];
  do {
    const response = await teacher.call(
      `/api/classes?order=schedule&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await response.json();
    names.push(
      ...result.items.map((item: { displayName: string }) => item.displayName),
    );
    cursor = result.nextCursor;
  } while (cursor);
  expect(names).toEqual([
    "Z Earlier",
    "A Later",
    "B Next day",
    "C No timetable",
  ]);
});
it("orders group lessons by date and time across pages", async () => {
  const root = admin().db.doc(`apps/chotcong/users/${uid}`);
  const student = (
    await root
      .collection("students")
      .where("archivedAt", "==", null)
      .limit(1)
      .get()
  ).docs[0].id;
  const ids: string[] = [];
  for (const [sessionDate, startTime] of [
    ["2026-11-16", "08:00"],
    ["2026-11-15", "20:00"],
    ["2026-11-15", "08:00"],
  ]) {
    const response = await teacher.call("/api/lessons", "POST", {
      studentIds: [student],
      rateVnd: 200000,
      sessionDate,
      startTime,
      durationMinutes: 45,
      status: "planned",
      billable: true,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    ids.push((await response.json()).id);
  }
  const first = await (
    await teacher.call("/api/lessons?order=chronological&limit=2")
  ).json();
  expect(first.items.map((item: { id: string }) => item.id)).toEqual([
    ids[2],
    ids[1],
  ]);
  const second = await (
    await teacher.call(
      `/api/lessons?order=chronological&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
    )
  ).json();
  expect(second.items.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
  expect(second.nextCursor).toBeNull();
});
