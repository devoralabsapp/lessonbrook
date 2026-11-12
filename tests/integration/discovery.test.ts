import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { vietnamToday } from "@/domain";
import { addBusinessDays } from "@/domain/statements";
import { client, googleToken, origin } from "./helpers";

describe("Tìm kiếm, bộ lọc và onboarding qua HTTP với dữ liệu nhiều trang", () => {
  const db = admin().db;
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    uid: string,
    studentId: string;
  let partial: string, paid: string, unpaid: string, dueToday: string;
  const root = () => db.doc(`apps/chotcong/users/${uid}`);
  const create = async (path: string, data: unknown) => {
    const response = await a.call(path, "POST", data);
    expect(response.status).toBe(200);
    return response.json();
  };
  const list = async (url: string) => {
    const response = await a.call(url);
    expect(response.status).toBe(200);
    return response.json();
  };
  beforeAll(async () => {
    a = await client();
    b = await client();
    const token = await googleToken(),
      other = await googleToken();
    uid = token.uid;
    await a.login(token.idToken);
    await b.login(other.idToken);
  });
  it("hồ sơ bước đầu lưu bền/idempotent, chặn payload và session chéo; tiến trình chỉ thuộc tài khoản hiện tại", async () => {
    expect((await list("/api/onboarding")).profileConfirmed).toBe(false);
    expect((await fetch(origin + "/api/onboarding")).status).toBe(401);
    const key = randomUUID(),
      data = { displayName: "Cô Hồng", bankDetails: "Thông tin riêng" };
    for (let i = 0; i < 2; i++)
      expect((await a.call("/api/onboarding", "POST", data, key)).status).toBe(
        200,
      );
    const pref = root().collection("preferences").doc("onboarding"),
      first = (await pref.get()).get("profileConfirmedAt");
    expect(first).toBeInstanceOf(Timestamp);
    expect(await list("/api/onboarding")).toMatchObject({
      profileConfirmed: true,
      completed: false,
      student: null,
      session: null,
      profile: data,
    });
    expect(
      (await (await b.call("/api/onboarding")).json()).profile.displayName,
    ).not.toBe(data.displayName);
    expect(
      (
        await a.call(
          "/api/onboarding",
          "POST",
          { ...data, displayName: "Tên khác" },
          key,
        )
      ).status,
    ).toBe(409);
    expect(
      (await a.call("/api/onboarding", "POST", { ...data, ownerUid: "other" }))
        .status,
    ).toBe(400);
    expect((await a.call("/api/onboarding?ownerUid=other")).status).toBe(400);
    expect(
      (
        await a.call("/api/onboarding", "POST", data, randomUUID(), {
          Origin: "https://other.test",
        })
      ).status,
    ).toBe(403);
    expect((await pref.get()).get("profileConfirmedAt").isEqual(first)).toBe(
      true,
    );
    studentId = (
      await create("/api/students", {
        displayName: "A Lan",
        defaultRateVnd: 200000,
      })
    ).id;
    expect((await list("/api/onboarding")).student.id).toBe(studentId);
  });
  it("tìm không dấu ngoài 200 mục đầu và phân trang đủ kết quả; cursor gắn UID/bộ lọc", async () => {
    const template = (
        await root().collection("students").doc(studentId).get()
      ).data()!,
      batch = db.batch();
    for (let i = 0; i < 230; i++)
      batch.create(
        root()
          .collection("students")
          .doc(`row-${String(i).padStart(3, "0")}`),
        {
          ...template,
          displayName: `A Học viên ${String(i).padStart(3, "0")}`,
        },
      );
    for (let i = 0; i < 3; i++)
      batch.create(root().collection("students").doc(`target-${i}`), {
        ...template,
        displayName: "Z ĐẶNG Hồng Ánh",
      });
    await batch.commit();
    const base = "/api/students?q=dang%20hong%20anh&limit=1";
    let page = await list(base);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeTruthy();
    const cursor = page.nextCursor;
    const ids: string[] = [];
    for (let i = 0; i < 6 && page.nextCursor; i++) {
      page = await list(
        base + "&cursor=" + encodeURIComponent(page.nextCursor),
      );
      ids.push(...page.items.map((s: { id: string }) => s.id));
    }
    expect(ids).toEqual(["target-0", "target-1", "target-2"]);
    expect(page.nextCursor).toBeNull();
    expect((await a.call("/api/students?q=Lan&cursor=" + cursor)).status).toBe(
      400,
    );
    expect((await b.call(base + "&cursor=" + cursor)).status).toBe(400);
    expect((await a.call("/api/students?q=" + "a".repeat(101))).status).toBe(
      400,
    );
    const archiveBatch = db.batch();
    for (let i = 0; i < 3; i++)
      archiveBatch.update(root().collection("students").doc(`target-${i}`), {
        archivedAt: new Timestamp(1700000000, 123456000 + i * 1000),
      });
    await archiveBatch.commit();
    page = await list("/api/students?archived=true&q=Hồng&limit=1");
    const archivedIds = page.items.map((s: { id: string }) => s.id);
    while (page.nextCursor) {
      page = await list(
        "/api/students?archived=true&q=hong&limit=1&cursor=" +
          encodeURIComponent(page.nextCursor),
      );
      archivedIds.push(...page.items.map((s: { id: string }) => s.id));
    }
    expect(archivedIds).toEqual(["target-2", "target-1", "target-0"]);
  });
  it("lọc trạng thái/billing/date không bỏ sót sau trang rỗng; buổi hủy/miễn phí không vào chưa lập bảng", async () => {
    const completed = await create("/api/sessions", {
      studentId,
      sessionDate: "2026-10-15",
      status: "completed",
      billable: true,
    });
    await create("/api/sessions", {
      studentId,
      sessionDate: "2026-10-15",
      status: "completed",
      billable: false,
    });
    await create("/api/sessions", {
      studentId,
      sessionDate: "2026-10-15",
      status: "cancelled",
      billable: false,
    });
    const template = (
        await root().collection("sessions").doc(completed.id).get()
      ).data()!,
      batch = db.batch();
    for (let i = 0; i < 220; i++)
      batch.create(root().collection("sessions").doc(`planned-${i}`), {
        ...template,
        sessionDate: "2026-10-31",
        status: "planned",
        amountVnd: 0,
        requestId: randomUUID(),
      });
    await batch.commit();
    const base = `/api/sessions?studentId=${studentId}&from=2026-10-01&to=2026-10-31&status=completed&billing=unbilled`;
    const first = await list(base);
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(
      base + "&cursor=" + encodeURIComponent(first.nextCursor),
    );
    expect(second.items.map((s: { id: string }) => s.id)).toEqual([
      completed.id,
    ]);
    expect(second.nextCursor).toBeNull();
    expect(
      (
        await list(
          `/api/sessions?studentId=${studentId}&from=2026-10-15&to=2026-10-15&billing=free`,
        )
      ).items,
    ).toHaveLength(1);
    const cancelledFirst = await list(
      `/api/sessions?studentId=${studentId}&status=cancelled`,
    );
    expect(cancelledFirst.items).toEqual([]);
    const cancelledNext = await list(
      `/api/sessions?studentId=${studentId}&status=cancelled&cursor=${encodeURIComponent(cancelledFirst.nextCursor)}`,
    );
    expect(cancelledNext.items).toHaveLength(1);
    expect(
      (await a.call(base + "&billing=free&cursor=" + first.nextCursor)).status,
    ).toBe(400);
    expect((await b.call(`/api/sessions?studentId=${studentId}`)).status).toBe(
      404,
    );
    expect(await list("/api/onboarding")).toMatchObject({
      completed: true,
      session: { status: "completed" },
    });
  });
  it("bảng kê chưa thu/một phần/đủ/quá hạn: đúng ngày Việt Nam và tiếp tục sau hơn 200 bản đã đủ", async () => {
    async function issue(amount: number, due: string) {
      const session = await create("/api/sessions", {
        studentId,
        sessionDate: vietnamToday(),
        status: "completed",
        billable: true,
      });
      const draft = await create("/api/statements", {
        studentId,
        sessionIds: [session.id],
        periodStart: vietnamToday(),
        periodEnd: vietnamToday(),
        dueDate: due,
      });
      await create(`/api/statements/${draft.id}/issue`, { version: 1 });
      if (amount)
        await create(`/api/statements/${draft.id}/payments`, {
          amountVnd: amount,
          receivedDate: vietnamToday(),
          method: "cash",
        });
      return draft.id as string;
    }
    const yesterday = addBusinessDays(vietnamToday(), -1);
    unpaid = await issue(0, yesterday);
    partial = await issue(100000, yesterday);
    paid = await issue(200000, yesterday);
    dueToday = await issue(0, vietnamToday());
    const statementTemplate = (
      await root().collection("statements").doc(paid).get()
    ).data()!;
    const sessionTemplate = (
      await root()
        .collection("sessions")
        .doc(statementTemplate.items[0].sessionId)
        .get()
    ).data()!;
    const paymentTemplate = (
      await root().collection("payments").where("statementId", "==", paid).get()
    ).docs[0].data();
    let batch = db.batch(),
      writes = 0;
    const fixtureTime = Timestamp.fromMillis(Date.now() + 1000);
    const previousDay = Timestamp.fromDate(
      new Date(`${yesterday}T12:00:00+07:00`),
    );
    for (let i = 0; i < 220; i++) {
      const id = `paid-fixture-${i}`,
        sessionId = `paid-session-${i}`;
      batch.create(root().collection("statements").doc(id), {
        ...statementTemplate,
        issueDate: i === 219 ? yesterday : statementTemplate.issueDate,
        number: `CC-${vietnamToday().slice(0, 4)}-${String(1000 + i).padStart(6, "0")}`,
        createdAt:
          i >= 218
            ? previousDay
            : new Timestamp(
                fixtureTime.seconds,
                fixtureTime.nanoseconds + i * 1000,
              ),
        issuedAt:
          i === 219
            ? previousDay
            : new Timestamp(
                fixtureTime.seconds,
                fixtureTime.nanoseconds + i * 1000,
              ),
        items: [{ ...statementTemplate.items[0], sessionId }],
      });
      batch.create(root().collection("sessions").doc(sessionId), {
        ...sessionTemplate,
        billedStatementId: id,
        requestId: randomUUID(),
      });
      batch.create(root().collection("payments").doc(`paid-payment-${i}`), {
        ...paymentTemplate,
        statementId: id,
        requestId: randomUUID(),
      });
      writes += 3;
      if (writes >= 450) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }
    batch.set(root().collection("counters").doc(vietnamToday().slice(0, 4)), {
      lastValue: 1219,
      updatedAt: Timestamp.now(),
      schemaVersion: 1,
    });
    await batch.commit();
    const first = await list("/api/statements?status=overdue&limit=10");
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBeTruthy();
    const rest = await list(
      "/api/statements?status=overdue&limit=10&cursor=" +
        encodeURIComponent(first.nextCursor),
    );
    expect(rest.items.map((s: { id: string }) => s.id).sort()).toEqual(
      [partial, unpaid].sort(),
    );
    async function all(url: string) {
      const result: { id: string }[] = [];
      let page = await list(url);
      for (let i = 0; i < 10; i++) {
        result.push(...page.items);
        if (!page.nextCursor) return result;
        page = await list(
          url + "&cursor=" + encodeURIComponent(page.nextCursor),
        );
      }
      throw new Error("Pagination did not terminate");
    }
    expect(
      (await all("/api/statements?status=partial")).map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([partial]);
    expect(
      (await all("/api/statements?status=unpaid"))
        .map((s: { id: string }) => s.id)
        .sort(),
    ).toEqual([unpaid, dueToday, partial].sort());
    const paidPage = await list("/api/statements?status=paid&limit=50");
    expect(paidPage.items).toHaveLength(50);
    expect(
      paidPage.items.every(
        (s: { paidVnd: number; totalVnd: number }) => s.paidVnd === s.totalVnd,
      ),
    ).toBe(true);
    expect(
      (
        await a.call(
          "/api/statements?status=partial&cursor=" + first.nextCursor,
        )
      ).status,
    ).toBe(400);
    const previousDayUrl = `/api/statements?status=paid&studentId=${studentId}&from=${yesterday}&to=${yesterday}`;
    expect((await all(previousDayUrl)).map(({ id }) => id)).toEqual([
      "paid-fixture-219",
    ]);
    const issuedToday = await all(
      `/api/statements?status=paid&studentId=${studentId}&from=${vietnamToday()}&limit=50`,
    );
    expect(issuedToday.map(({ id }) => id)).toContain("paid-fixture-218");
    expect(issuedToday.map(({ id }) => id)).not.toContain("paid-fixture-219");
    expect(
      (await a.call(`/api/statements?from=${vietnamToday()}&to=${yesterday}`))
        .status,
    ).toBe(400);
    const history = await list(
      `/api/statements?status=overdue&studentId=${studentId}`,
    );
    expect(history.nextCursor).toBeTruthy();
  }, 60000);
});
