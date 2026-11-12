import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { vietnamToday } from "@/domain";
import { addBusinessDays, type Statement } from "@/domain/statements";
import { type SharePreview, type ShareResult } from "@/domain/sharing";
import { shareRateBuckets } from "@/lib/server/share-rate-limit";
import { client, googleToken, origin } from "./helpers";

describe("Thu tiền và link chia sẻ qua HTTP/Firestore thật trên Emulator", () => {
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    uid: string,
    studentId: string,
    statementId: string;
  const today = vietnamToday();
  const root = () => admin().db.doc(`apps/chotcong/users/${uid}`);
  const get = async (): Promise<Statement> =>
    (await a.call(`/api/statements/${statementId}`)).json();
  const payBody = (amountVnd = 1000000) => ({
    amountVnd,
    receivedDate: today,
    method: "transfer",
    privateNote: "PRIVATE PAYMENT NOTE",
  });
  const pay = (amountVnd = 1000000, key = randomUUID()) =>
    a.call(
      `/api/statements/${statementId}/payments`,
      "POST",
      payBody(amountVnd),
      key,
    );
  async function preview(): Promise<SharePreview> {
    const r = await a.call(`/api/statements/${statementId}/public-preview`);
    expect(r.status).toBe(200);
    return r.json();
  }
  async function share(): Promise<ShareResult> {
    const p = await preview();
    const r = await a.call(`/api/statements/${statementId}/share`, "POST", {
      version: p.version,
      previewHash: p.previewHash,
    });
    expect(r.status).toBe(200);
    return r.json();
  }
  const resolve = (token: string, extra?: Record<string, string>) =>
    fetch(origin + "/api/share/resolve", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", ...extra },
      body: JSON.stringify({ token }),
    });
  beforeEach(async () => {
    const batch = admin().db.batch();
    for (const bucket of shareRateBuckets("loopback", Date.now()))
      batch.delete(
        admin().db.collection("apps/chotcong/shareRateLimits").doc(bucket.id),
      );
    await batch.commit();
    a = await client();
    b = await client();
    const ta = await googleToken(),
      tb = await googleToken();
    uid = ta.uid;
    await a.login(ta.idToken);
    await b.login(tb.idToken);
    await a.call("/api/profile", "PATCH", {
      displayName: "Cô Mai",
      bankDetails: "Ngân hàng đã chọn",
    });
    studentId = (
      await (
        await a.call("/api/students", "POST", {
          displayName: "Lan",
          defaultRateVnd: 200000,
          phone: "0900000000",
          privateNote: "PRIVATE STUDENT NOTE",
        })
      ).json()
    ).id;
    const ids: string[] = [];
    for (let i = 0; i < 8; i++)
      ids.push(
        (
          await (
            await a.call("/api/sessions", "POST", {
              studentId,
              sessionDate: today,
              status: "completed",
              billable: true,
              privateNote: "PRIVATE SESSION NOTE",
            })
          ).json()
        ).id,
      );
    const r = await a.call("/api/statements", "POST", {
      studentId,
      periodStart: today,
      periodEnd: today,
      dueDate: addBusinessDays(today, -1),
      sessionIds: ids,
      includeBankDetails: true,
    });
    expect(r.status).toBe(200);
    statementId = (await r.json()).id;
    expect(
      (
        await a.call(`/api/statements/${statementId}/issue`, "POST", {
          version: 1,
        })
      ).status,
    ).toBe(200);
  });
  it("8 × 200k → thu 1m và 600k → vô hiệu hóa: chi tiết/tổng quan/public cùng đúng; chỉ lưu hash token", async () => {
    async function lessonsWithPayment(status: "paid" | "unpaid") {
      const response = await a.call(
        `/api/sessions?studentId=${studentId}&billing=${status}`,
      );
      expect(response.status).toBe(200);
      return (await response.json()).items;
    }
    expect(await lessonsWithPayment("paid")).toEqual([]);
    expect(await lessonsWithPayment("unpaid")).toHaveLength(8);
    const key = randomUUID();
    const first = await pay(1000000, key);
    expect(first.status).toBe(200);
    const paymentId = (await first.json()).id;
    expect((await pay(1000000, key)).status).toBe(200);
    expect((await get()).paidVnd).toBe(1000000);
    expect(await lessonsWithPayment("unpaid")).toHaveLength(8);
    const summary = await (await a.call("/api/summary")).json();
    expect(summary).toMatchObject({
      outstandingVnd: 600000,
      overdueVnd: 600000,
      receivedMonthVnd: 1000000,
      unbilledCount: 0,
    });
    const p = await preview(),
      linkKey = randomUUID(),
      body = { version: p.version, previewHash: p.previewHash };
    const link: ShareResult = await (
      await a.call(
        `/api/statements/${statementId}/share`,
        "POST",
        body,
        linkKey,
      )
    ).json();
    expect(link.token).toHaveLength(43);
    expect(link.tokenHash).toBe(
      createHash("sha256").update(link.token!).digest("hex"),
    );
    const replay = await (
      await a.call(
        `/api/statements/${statementId}/share`,
        "POST",
        body,
        linkKey,
      )
    ).json();
    expect(replay.token).toBeNull();
    const doc = await admin()
      .db.doc(`apps/chotcong/shareTokens/${link.tokenHash}`)
      .get();
    expect(doc.exists).toBe(true);
    expect(doc.get("ownerUid")).toBe(uid);
    expect(JSON.stringify(doc.data())).not.toContain(link.token!);
    const ops = await root().collection("operationRequests").get(),
      audits = await root().collection("auditEvents").get();
    expect(
      JSON.stringify([...ops.docs, ...audits.docs].map((d) => d.data())),
    ).not.toContain(link.token!);
    const r = await resolve(link.token!);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const pub = await r.json();
    expect(Object.keys(pub).sort()).toEqual(
      [
        "teacherName",
        "recipientName",
        "number",
        "issueDate",
        "dueDate",
        "items",
        "totalVnd",
        "paidVnd",
        "remainingVnd",
        "payments",
        "bankDetails",
        "transferReference",
        "updatedAt",
      ].sort(),
    );
    expect(pub).toMatchObject({
      teacherName: "Cô Mai",
      recipientName: "Lan",
      totalVnd: 1600000,
      paidVnd: 1000000,
      remainingVnd: 600000,
      bankDetails: "Ngân hàng đã chọn",
    });
    for (const privateValue of [
      uid,
      studentId,
      statementId,
      paymentId,
      "PRIVATE",
      "0900000000",
      link.tokenHash!,
    ])
      expect(JSON.stringify(pub)).not.toContain(privateValue);
    expect(
      pub.items.every(
        (item: object) =>
          Object.keys(item).sort().join() === "amountVnd,sessionDate",
      ),
    ).toBe(true);
    expect(Object.keys(pub.payments[0]).sort()).toEqual([
      "amountVnd",
      "receivedDate",
    ]);
    expect((await pay(600000)).status).toBe(200);
    const paidLessons = await lessonsWithPayment("paid");
    expect(paidLessons).toHaveLength(8);
    expect(
      paidLessons.every(
        (lesson: { paymentStatus: string; billedStatementId: string }) =>
          lesson.paymentStatus === "paid" &&
          lesson.billedStatementId === statementId,
      ),
    ).toBe(true);
    expect(await lessonsWithPayment("unpaid")).toEqual([]);
    expect((await (await resolve(link.token!)).json()).remainingVnd).toBe(0);
    expect((await get()).activePaymentCount).toBe(2);
    expect(
      (
        await a.call(`/api/statements/${statementId}/void`, "POST", {
          version: (await get()).version,
          reason: "Không được hủy khi còn tiền",
        })
      ).status,
    ).toBe(409);
    const voidKey = randomUUID();
    expect(
      (
        await a.call(
          `/api/payments/${paymentId}/void`,
          "POST",
          { reason: "Nhập sai, giữ dấu vết" },
          voidKey,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(
          `/api/payments/${paymentId}/void`,
          "POST",
          { reason: "Nhập sai, giữ dấu vết" },
          voidKey,
        )
      ).status,
    ).toBe(200);
    expect((await get()).paidVnd).toBe(600000);
    expect((await get()).activePaymentCount).toBe(1);
    expect(await lessonsWithPayment("paid")).toEqual([]);
    expect(await lessonsWithPayment("unpaid")).toHaveLength(8);
    expect((await (await resolve(link.token!)).json()).remainingVnd).toBe(
      1000000,
    );
    const after = await (await a.call("/api/summary")).json();
    expect(after).toMatchObject({
      outstandingVnd: 1000000,
      overdueVnd: 1000000,
      receivedMonthVnd: 600000,
    });
    const ledger = await root().collection("payments").get();
    expect(ledger.size).toBe(2);
    expect(
      ledger.docs
        .filter((d) => d.get("voidedAt") === null)
        .reduce((sum, d) => sum + d.get("amountVnd"), 0),
    ).toBe((await get()).paidVnd);
  });
  it("tổng quan tính ngày nhận tiền trong tháng, ngày đến hạn inclusive và tách buổi chưa lập bảng", async () => {
    const lastMonth = addBusinessDays(today.slice(0, 7) + "-01", -1);
    expect(
      (
        await a.call(`/api/statements/${statementId}/payments`, "POST", {
          ...payBody(400000),
          receivedDate: lastMonth,
        })
      ).status,
    ).toBe(200);
    expect((await pay(200000)).status).toBe(200);
    expect(
      (
        await a.call("/api/sessions", "POST", {
          studentId,
          sessionDate: today,
          status: "completed",
          billable: true,
        })
      ).status,
    ).toBe(200);
    const before = await (await a.call("/api/summary")).json();
    expect(before).toMatchObject({
      outstandingVnd: 1000000,
      overdueVnd: 1000000,
      receivedMonthVnd: 200000,
      unbilledCount: 1,
      unbilledVnd: 200000,
    });
    // Server clock is real VN today; changing only dueDate must remove the overdue label today.
    await root()
      .collection("statements")
      .doc(statementId)
      .update({ dueDate: today });
    expect(await (await a.call("/api/summary")).json()).toMatchObject({
      outstandingVnd: 1000000,
      overdueVnd: 0,
      receivedMonthVnd: 200000,
      unbilledVnd: 200000,
    });
  });
  it("thu đồng thời không vượt; retry/double click không nhân đôi; vô hiệu hóa cạnh tranh không âm sổ", async () => {
    const pair = await Promise.all([pay(), pay()]);
    expect(pair.map((r) => r.status).sort()).toEqual([200, 409]);
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => pay(600000, key)),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const ids = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(ids.map((r) => r.id)).size).toBe(1);
    expect((await get()).paidVnd).toBe(1600000);
    expect((await get()).activePaymentCount).toBe(2);
    expect(
      (
        await a.call(
          `/api/statements/${statementId}/payments`,
          "POST",
          { ...payBody(600000), method: "cash" },
          key,
        )
      ).status,
    ).toBe(409);
    const voids = await Promise.all([
      a.call(`/api/payments/${ids[0].id}/void`, "POST", { reason: "Sửa" }),
      a.call(`/api/payments/${ids[0].id}/void`, "POST", { reason: "Sửa" }),
    ]);
    expect(voids.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await get()).paidVnd).toBe(1000000);
    expect((await get()).activePaymentCount).toBe(1);
  });
  it("backend chặn chéo UID, input giả, tương lai, thu cho draft/void; không nhận snapshot client", async () => {
    expect(
      (await b.call(`/api/statements/${statementId}/payments`)).status,
    ).toBe(404);
    expect(
      (
        await b.call(
          `/api/statements/${statementId}/payments`,
          "POST",
          payBody(),
        )
      ).status,
    ).toBe(404);
    expect(
      (await b.call(`/api/statements/${statementId}/public-preview`)).status,
    ).toBe(404);
    expect((await b.call(`/api/statements/${statementId}/share`)).status).toBe(
      404,
    );
    for (const extra of [
      { amountVnd: 0 },
      { amountVnd: 1.5 },
      { amountVnd: Number.MAX_SAFE_INTEGER },
      { ownerId: uid },
      { studentId },
      { paidVnd: 0 },
      { statementId },
    ])
      expect(
        (
          await a.call(`/api/statements/${statementId}/payments`, "POST", {
            ...payBody(),
            ...extra,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await a.call(`/api/statements/${statementId}/payments`, "POST", {
          ...payBody(),
          receivedDate: addBusinessDays(today, 1),
        })
      ).status,
    ).toBe(400);
    const paymentId = (await (await pay()).json()).id;
    expect(
      (
        await b.call(`/api/payments/${paymentId}/void`, "POST", {
          reason: "Khác UID",
        })
      ).status,
    ).toBe(404);
    expect(
      (await a.call(`/api/payments/${paymentId}/void`, "POST", { reason: "" }))
        .status,
    ).toBe(400);
    await root()
      .collection("statements")
      .doc(statementId)
      .update({ status: "draft" });
    expect((await pay(1)).status).toBe(409);
    expect(
      (await a.call(`/api/statements/${statementId}/public-preview`)).status,
    ).toBe(409);
    expect(
      (
        await a.call(`/api/statements/${statementId}/revoke-share`, "POST", {
          version: (await get()).version,
        })
      ).status,
    ).toBe(409);
    await root()
      .collection("statements")
      .doc(statementId)
      .update({ status: "void" });
    expect((await pay(1)).status).toBe(409);
  });
  it("rotate/revoke/expiry/pointer/void đều chặn link cũ ngay; không phân biệt các link không khả dụng", async () => {
    const first = await share();
    const second = await share();
    const unknown = await resolve(randomBytes(32).toString("base64url"));
    expect(unknown.status).toBe(404);
    const generic = await unknown.json();
    const old = await resolve(first.token!);
    expect(old.status).toBe(404);
    expect(await old.json()).toEqual(generic);
    expect((await resolve(second.token!)).status).toBe(200);
    await admin()
      .db.doc(`apps/chotcong/shareTokens/${second.tokenHash}`)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    const expired = await resolve(second.token!);
    expect(expired.status).toBe(404);
    expect(await expired.json()).toEqual(generic);
    const third = await share();
    expect(
      (
        await a.call(`/api/statements/${statementId}/revoke-share`, "POST", {
          version: (await get()).version,
        })
      ).status,
    ).toBe(200);
    await admin()
      .db.doc(`apps/chotcong/shareTokens/${third.tokenHash}`)
      .update({ revokedAt: null });
    expect((await resolve(third.token!)).status).toBe(404); // Pointer also revokes access.
    const fourth = await share();
    expect(
      (
        await a.call(`/api/statements/${statementId}/void`, "POST", {
          version: (await get()).version,
          reason: "Lập lại",
        })
      ).status,
    ).toBe(200);
    const cancelled = await resolve(fourth.token!);
    expect(cancelled.status).toBe(404);
    expect(await cancelled.json()).toEqual(generic);
    expect(
      (
        await admin()
          .db.doc(`apps/chotcong/shareTokens/${fourth.tokenHash}`)
          .get()
      ).get("revokedAt"),
    ).toBeInstanceOf(Timestamp);
    expect((await a.call(`/api/statements/${statementId}/share`)).status).toBe(
      200,
    );
  });
  it("xem trước cũ/hash giả bị từ chối; hai tab tạo link cạnh tranh chỉ một thay đổi", async () => {
    const old = await preview();
    expect((await pay()).status).toBe(200);
    expect(
      (
        await a.call(`/api/statements/${statementId}/share`, "POST", {
          version: old.version,
          previewHash: old.previewHash,
        })
      ).status,
    ).toBe(409);
    const fresh = await preview();
    expect(
      (
        await a.call(`/api/statements/${statementId}/share`, "POST", {
          version: fresh.version,
          previewHash: "0".repeat(64),
        })
      ).status,
    ).toBe(409);
    const results = await Promise.all(
      [1, 2].map(() =>
        a.call(`/api/statements/${statementId}/share`, "POST", {
          version: fresh.version,
          previewHash: fresh.previewHash,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const good = await results.find((r) => r.status === 200)!.json();
    expect((await resolve(good.token)).status).toBe(200);
    expect(
      (
        await root()
          .collection("auditEvents")
          .where("action", "==", "share-created")
          .get()
      ).size,
    ).toBe(1);
  });
  it("phân trang hơn 50 khoản cùng ngày không mất/trùng; giới hạn public/active được kiểm tra trước ghi", async () => {
    const batch = admin().db.batch();
    const ids = Array.from({ length: 100 }, () => randomUUID());
    for (const id of ids)
      batch.create(root().collection("payments").doc(id), {
        ...payBody(1),
        statementId,
        studentId,
        recordedAt: Timestamp.now(),
        voidedAt: null,
        voidReason: null,
        requestId: randomUUID(),
        schemaVersion: 1,
      });
    batch.update(root().collection("statements").doc(statementId), {
      paidVnd: 100,
      activePaymentCount: 100,
    });
    await batch.commit();
    let cursor: string | null = null;
    const seen: string[] = [];
    do {
      const r = await a.call(
        `/api/statements/${statementId}/payments?limit=17${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(r.status).toBe(200);
      const page = await r.json();
      seen.push(...page.items.map((p: { id: string }) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(100);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect((await pay(1)).status).toBe(409);
    expect((await get()).paidVnd).toBe(100);
    const link = await share();
    expect((await (await resolve(link.token!)).json()).payments).toHaveLength(
      100,
    );
  });
  it("public không nhận origin lạ và có rate limit dùng transaction, reset theo cửa sổ", async () => {
    const link = await share();
    expect(
      (await resolve(link.token!, { Origin: "https://other.example" })).status,
    ).toBe(404);
    const bucket = shareRateBuckets("loopback", Date.now())[0],
      ref = admin()
        .db.collection("apps/chotcong/shareRateLimits")
        .doc(bucket.id);
    await ref.set({ window: bucket.window, count: 60, schemaVersion: 1 });
    const limited = await resolve(link.token!);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    await ref.set({ window: bucket.window - 1, count: 60, schemaVersion: 1 });
    expect((await resolve(link.token!)).status).toBe(200);
    expect((await ref.get()).get("count")).toBe(1);
    const page = await fetch(origin + "/s");
    expect(page.headers.get("cache-control")).toContain("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
