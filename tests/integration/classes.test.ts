import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { sessionInputSchema, vietnamToday } from "@/domain";
import { client, googleToken, origin } from "./helpers";
describe("Lớp học/buổi nhóm: HTTP và transaction Emulator", () => {
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    uid: string;
  let ids: string[], classId: string;
  const group = (extra: Record<string, unknown> = {}) => ({
    classId,
    studentIds: ids.slice(0, 2),
    rateVnd: 150000,
    sessionDate: "2026-10-12",
    startTime: "18:00",
    durationMinutes: 60,
    status: "completed",
    billable: true,
    privateNote: "Ghi chú buổi riêng",
    ...extra,
  });
  const root = () => admin().db.doc(`apps/chotcong/users/${uid}`);
  async function created(path: string, value: unknown) {
    const response = await a.call(path, "POST", value);
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).id as string;
  }
  beforeEach(async () => {
    const ta = await googleToken(),
      tb = await googleToken();
    uid = ta.uid;
    a = await client();
    b = await client();
    await a.login(ta.idToken);
    await b.login(tb.idToken);
    ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await created("/api/students", {
          displayName: `Học viên ${i}`,
          defaultRateVnd: 200000 + i * 100000,
        }),
      );
    classId = await created("/api/classes", {
      displayName: "Piano chung",
      studentIds: ids,
      rateVnd: 150000,
      privateNote: "Ghi chú lớp riêng",
    });
  });
  it("buổi chụp một giá/người, bỏ người vắng; retry đồng thời không tạo thêm dòng hoặc audit", async () => {
    const key = randomUUID();
    const responses = await Promise.all([
      a.call("/api/lessons", "POST", group(), key),
      a.call("/api/lessons", "POST", group(), key),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const first = await responses[0].json();
    expect(await responses[1].json()).toEqual(first);
    const lesson = await (await a.call(`/api/lessons/${first.id}`)).json();
    expect(lesson.studentIds).toEqual(ids.slice(0, 2));
    expect(lesson.sessions).toHaveLength(2);
    expect(lesson.sessions.map((s: { rateVnd: number }) => s.rateVnd)).toEqual([
      150000, 150000,
    ]);
    expect(
      (await root().collection("sessions").count().get()).data().count,
    ).toBe(2);
    expect(
      (await root().collection("auditEvents").count().get()).data().count,
    ).toBe(1);
    expect(
      (await a.call("/api/lessons", "POST", group({ rateVnd: 100000 }), key))
        .status,
    ).toBe(409);
    const summary = await (await a.call("/api/summary")).json();
    expect(summary.unbilledVnd).toBe(300000);
    expect(summary.unbilledCount).toBe(2);
  });
  it("thay lớp/giá/thành viên không sửa buổi cũ; không thêm buổi ở lớp/học viên lưu trữ", async () => {
    const lessonId = await created("/api/lessons", group());
    expect(
      (
        await a.call(`/api/classes/${classId}`, "PATCH", {
          displayName: "Tên mới",
          studentIds: [ids[2]],
          rateVnd: 250000,
        })
      ).status,
    ).toBe(200);
    const old = await (await a.call(`/api/lessons/${lessonId}`)).json();
    expect(old.className).toBe("Piano chung");
    expect(old.rateVnd).toBe(150000);
    expect(old.studentIds).toEqual(ids.slice(0, 2));
    expect((await a.call("/api/lessons", "POST", group())).status).toBe(409);
    expect(
      (await a.call("/api/lessons", "POST", group({ studentIds: [ids[2]] })))
        .status,
    ).toBe(409);
    expect(
      (
        await a.call(`/api/classes/${classId}/archive`, "POST", {
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(
          "/api/lessons",
          "POST",
          group({ studentIds: [ids[2]], rateVnd: 250000 }),
        )
      ).status,
    ).toBe(409);
    await a.call(`/api/students/${ids[0]}/archive`, "POST", { archived: true });
    expect(
      (await a.call("/api/lessons", "POST", group({ classId: null }))).status,
    ).toBe(409);
    expect(
      (await root().collection("lessons").count().get()).data().count,
    ).toBe(1);
  });
  it("hủy riêng một học viên, giữ khi sửa chung; ngày/giá chỉ sửa atomically tại buổi nhóm", async () => {
    const id = await created("/api/lessons", group({ classId: null }));
    let lesson = await (await a.call(`/api/lessons/${id}`)).json();
    const row = lesson.sessions[0];
    const base = sessionInputSchema.parse(
      Object.fromEntries(
        Object.keys(sessionInputSchema.shape).map((key) => [key, row[key]]),
      ),
    );
    expect(
      (
        await a.call(`/api/sessions/${row.id}`, "PATCH", {
          ...base,
          rateVnd: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await a.call(`/api/sessions/${row.id}`, "PATCH", {
          ...base,
          sessionDate: "2026-10-13",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await a.call(`/api/sessions/${row.id}`, "PATCH", {
          ...base,
          status: "cancelled",
          billable: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(
          `/api/lessons/${id}`,
          "PATCH",
          group({
            classId: null,
            rateVnd: 170000,
            status: null,
            billable: null,
            sessionDate: "2026-10-13",
          }),
        )
      ).status,
    ).toBe(200);
    lesson = await (await a.call(`/api/lessons/${id}`)).json();
    expect(lesson.sessions[0]).toMatchObject({
      status: "cancelled",
      billable: false,
      rateVnd: 170000,
      amountVnd: 0,
      sessionDate: "2026-10-13",
    });
    expect(lesson.sessions[1]).toMatchObject({
      status: "completed",
      billable: true,
      amountVnd: 170000,
      sessionDate: "2026-10-13",
    });
    expect(
      (
        await a.call(
          `/api/lessons/${id}`,
          "PATCH",
          group({ classId: null, studentIds: [ids[2]] }),
        )
      ).status,
    ).toBe(409);
  });
  it("phát hành cạnh tranh sửa nhóm: không vượt khóa; bảng kê chỉ có tiền học viên đó", async () => {
    const id = await created("/api/lessons", group());
    const lesson = await (await a.call(`/api/lessons/${id}`)).json();
    const statementId = await created("/api/statements", {
      studentId: ids[0],
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      dueDate: vietnamToday(),
      sessionIds: [lesson.sessionIds[0]],
      includeBankDetails: false,
    });
    const [issue, edit] = await Promise.all([
      a.call(`/api/statements/${statementId}/issue`, "POST", { version: 1 }),
      a.call(
        `/api/lessons/${id}`,
        "PATCH",
        group({ rateVnd: 180000, status: null, billable: null }),
      ),
    ]);
    expect([issue.status, edit.status].sort()).toEqual([200, 409]);
    const after = await (await a.call(`/api/lessons/${id}`)).json();
    expect(
      new Set(after.sessions.map((s: { rateVnd: number }) => s.rateVnd)).size,
    ).toBe(1);
    if (issue.status === 200) {
      const statement = await (
        await a.call(`/api/statements/${statementId}`)
      ).json();
      expect(statement.totalVnd).toBe(150000);
      expect(statement.items).toHaveLength(1);
      expect(after.sessions[0].billedStatementId).toBe(statementId);
      expect(after.sessions[1].billedStatementId).toBeNull();
      expect(
        (
          await a.call(
            `/api/lessons/${id}`,
            "PATCH",
            group({ status: null, billable: null }),
          )
        ).status,
      ).toBe(409);
    }
  });
  it("khóa giá chung khi đã phát hành, chỉ khóa đúng người; public không lộ danh sách lớp", async () => {
    const id = await created("/api/lessons", group());
    const lesson = await (await a.call(`/api/lessons/${id}`)).json();
    const statementId = await created("/api/statements", {
      studentId: ids[0],
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      dueDate: vietnamToday(),
      sessionIds: [lesson.sessionIds[0]],
      includeBankDetails: false,
    });
    expect(
      (
        await a.call(`/api/statements/${statementId}/issue`, "POST", {
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(
          `/api/lessons/${id}`,
          "PATCH",
          group({ rateVnd: 180000, status: null, billable: null }),
        )
      ).status,
    ).toBe(409);
    for (const [index, expected] of [
      [0, 409],
      [1, 200],
    ]) {
      const row = lesson.sessions[index];
      const input = sessionInputSchema.parse(
        Object.fromEntries(
          Object.keys(sessionInputSchema.shape).map((key) => [key, row[key]]),
        ),
      );
      expect(
        (
          await a.call(`/api/sessions/${row.id}`, "PATCH", {
            ...input,
            status: "cancelled",
            billable: false,
          })
        ).status,
      ).toBe(expected);
    }
    const preview = await (
      await a.call(`/api/statements/${statementId}/public-preview`)
    ).json();
    expect(preview.statement.totalVnd).toBe(150000);
    const text = JSON.stringify(preview.statement);
    for (const hidden of [
      ids[1],
      "Học viên 1",
      "Piano chung",
      "classId",
      "lessonId",
      "Ghi chú buổi riêng",
      "Ghi chú lớp riêng",
    ])
      expect(text).not.toContain(hidden);
    expect(
      (await (await a.call(`/api/lessons/${id}`)).json()).sessions[0].rateVnd,
    ).toBe(150000);
  });
  it("API không đọc/ghi/liên kết lớp, buổi, học viên chéo UID; query/payload strict và CSRF", async () => {
    const id = await created("/api/lessons", group());
    for (const path of [
      `/api/classes/${classId}`,
      `/api/lessons/${id}`,
      `/api/lessons?classId=${classId}`,
    ])
      expect((await b.call(path)).status).toBe(404);
    expect(
      (
        await b.call(`/api/classes/${classId}`, "PATCH", {
          displayName: "Khác",
          studentIds: ids,
          rateVnd: 150000,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.call("/api/classes", "POST", {
          displayName: "Khác",
          studentIds: ids,
          rateVnd: 150000,
        })
      ).status,
    ).toBe(404);
    expect((await b.call("/api/lessons", "POST", group())).status).toBe(404);
    expect(
      (await a.call("/api/lessons", "POST", group({ ownerUid: "foreign" })))
        .status,
    ).toBe(400);
    expect((await a.call("/api/classes?ownerUid=foreign")).status).toBe(400);
    expect(
      (
        await a.call("/api/lessons", "POST", group(), randomUUID(), {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    for (const path of ["classes", "lessons", "appearance"])
      expect((await fetch(`${origin}/api/${path}`)).status).toBe(401);
    expect((await (await b.call("/api/classes")).json()).items).toEqual([]);
  });
  it("phân trang lớp/buổi gắn bộ lọc và UID; xuất đủ roster/snapshot/appearance không lộ token", async () => {
    const id = await created("/api/lessons", group());
    await created("/api/lessons", group({ classId: null }));
    const secondClass = await created("/api/classes", {
      displayName: "Lớp khác",
      studentIds: [ids[0]],
      rateVnd: 100000,
    });
    const classes = await (await a.call("/api/classes?limit=1")).json();
    expect(classes.nextCursor).toBeTruthy();
    expect(
      (
        await b.call(
          `/api/classes?limit=1&cursor=${encodeURIComponent(classes.nextCursor)}`,
        )
      ).status,
    ).toBe(400);
    const lessons = await (
      await a.call(`/api/lessons?classId=${classId}`)
    ).json();
    expect(lessons.items.map((l: { id: string }) => l.id)).toEqual([id]);
    expect(
      (await (await a.call(`/api/lessons?classId=${secondClass}`)).json())
        .items,
    ).toEqual([]);
    expect(
      (await a.call("/api/appearance", "PATCH", { theme: "art" })).status,
    ).toBe(200);
    const exportId = await created("/api/exports", { dataset: "all" });
    const exports: Record<string, unknown> = {};
    for (const dataset of ["classes", "lessons", "appearance"]) {
      const response = await a.call(
        `/api/exports/${exportId}?dataset=${dataset}`,
      );
      expect(response.status).toBe(200);
      exports[dataset] = await response.json();
    }
    const text = JSON.stringify(exports);
    expect(text).toContain(classId);
    expect(text).toContain("art");
    expect(text).not.toContain("requestId");
    expect(text).not.toContain("shareToken");
  });
  it("bảy theme lưu server theo UID, retry và từ chối lựa chọn lạ", async () => {
    for (const theme of [
      "modern",
      "vintage",
      "art",
      "natura",
      "ocean",
      "command-line",
      "visual-code",
    ]) {
      const key = randomUUID();
      expect(
        (await a.call("/api/appearance", "PATCH", { theme }, key)).status,
      ).toBe(200);
      expect(
        (await a.call("/api/appearance", "PATCH", { theme }, key)).status,
      ).toBe(200);
      expect((await (await a.call("/api/appearance")).json()).theme).toBe(
        theme,
      );
      expect((await (await b.call("/api/appearance")).json()).theme).toBe(
        "natura",
      );
    }
    expect(
      (await a.call("/api/appearance", "PATCH", { theme: "other" })).status,
    ).toBe(400);
    expect(
      (
        await a.call("/api/appearance", "PATCH", {
          theme: "art",
          ownerUid: "other",
        })
      ).status,
    ).toBe(400);
  });
});
