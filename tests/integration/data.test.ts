import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { DATASETS, DELETE_CONFIRMATION, type ExportPage } from "@/domain/data";
import { accountControlRef, accountKey } from "@/lib/server/account-access";
import {
  advanceDeletion,
  DELETION_COOKIE,
} from "@/lib/server/account-deletion";
import { ensureProfile, saveStudent } from "@/lib/server/repository";
import { client, googleToken, origin } from "./helpers";
import { vietnamToday } from "@/domain";

describe("Xuất dữ liệu và xóa tài khoản: HTTP, Auth và Firestore Emulator", () => {
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    ta: Awaited<ReturnType<typeof googleToken>>,
    tb: Awaited<ReturnType<typeof googleToken>>,
    sub: string,
    uid: string,
    studentId: string,
    statementId: string;
  const root = () => admin().db.doc(`apps/chotcong/users/${uid}`);
  const body = (idToken = ta.idToken) => ({
    confirmation: DELETE_CONFIRMATION,
    acknowledged: true,
    idToken,
  });
  const start = (value: unknown = body()) =>
    a.call("/api/account/deletion/start", "POST", value);
  function proofFrom(response: Response) {
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(DELETION_COOKIE + "="));
    expect(cookie).toBeDefined();
    return cookie!.split(";")[0];
  }
  const deletion = (cookie: string, method = "GET", value: unknown = {}) =>
    a.call("/api/account/deletion", method, value, randomUUID(), {
      Cookie: a.csrfCookie + "; " + cookie,
    });
  async function finish(cookie: string) {
    for (let i = 0; i < 20; i++) {
      const response = await deletion(cookie, "POST");
      expect(response.status).toBe(200);
      const data = await response.json();
      if (data.phase === "done") return;
    }
    throw new Error("Deletion did not finish");
  }
  beforeEach(async () => {
    sub = randomUUID();
    ta = await googleToken(sub);
    tb = await googleToken();
    uid = ta.uid;
    a = await client();
    b = await client();
    await a.login(ta.idToken);
    await b.login(tb.idToken);
    expect(
      (
        await a.call("/api/profile", "PATCH", {
          displayName: "Cô Hằng",
          bankDetails: "Ngân hàng\n123456",
        })
      ).status,
    ).toBe(200);
    const s = await a.call("/api/students", "POST", {
      displayName: 'Lan, "Hà"\nBuổi đàn',
      defaultRateVnd: 200000,
      phone: "+84900000000",
      privateNote: '=HYPERLINK("https://example.test")',
    });
    expect(s.status).toBe(200);
    studentId = (await s.json()).id;
    const sessions: string[] = [];
    for (let day = 1; day <= 8; day++)
      sessions.push(
        (
          await (
            await a.call("/api/sessions", "POST", {
              studentId,
              sessionDate: `2026-10-${String(day).padStart(2, "0")}`,
              status: "completed",
              billable: true,
            })
          ).json()
        ).id,
      );
    await a.call("/api/sessions", "POST", {
      studentId,
      sessionDate: "2026-10-09",
      status: "cancelled",
      billable: false,
    });
    statementId = (
      await (
        await a.call("/api/statements", "POST", {
          studentId,
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
          dueDate: vietnamToday(),
          sessionIds: sessions,
          includeBankDetails: true,
        })
      ).json()
    ).id;
    expect(
      (
        await a.call(`/api/statements/${statementId}/issue`, "POST", {
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(`/api/statements/${statementId}/payments`, "POST", {
          amountVnd: 1000000,
          receivedDate: vietnamToday(),
          method: "transfer",
          privateNote: "Khoản thu riêng",
        })
      ).status,
    ).toBe(200);
  });
  afterEach(() => vi.restoreAllMocks());
  it("xuất đủ 10 loại, tiếng Việt/CSV an toàn, snapshot tiền đúng; job thuộc UID và retry không tạo lại", async () => {
    const key = randomUUID(),
      first = await a.call("/api/exports", "POST", { dataset: "all" }, key);
    expect(first.status).toBe(200);
    const id = (await first.json()).id;
    expect(
      (
        await (
          await a.call("/api/exports", "POST", { dataset: "all" }, key)
        ).json()
      ).id,
    ).toBe(id);
    expect(
      (await a.call("/api/exports", "POST", { dataset: "students" }, key))
        .status,
    ).toBe(409);
    expect((await b.call(`/api/exports/${id}?dataset=students`)).status).toBe(
      404,
    );
    for (const value of [
      { dataset: "all", ownerUid: tb.uid },
      { dataset: "shareTokens" },
      { dataset: "all", readTime: "2026-01-01" },
    ])
      expect((await a.call("/api/exports", "POST", value)).status).toBe(400);
    expect(
      (await a.call(`/api/exports/${id}?dataset=students&ownerUid=${tb.uid}`))
        .status,
    ).toBe(400);
    const result: Record<string, ExportPage> = {};
    for (const dataset of DATASETS) {
      const response = await a.call(`/api/exports/${id}?dataset=${dataset}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      result[dataset] = await response.json();
    }
    expect(result.students.records).toHaveLength(1);
    expect(result.sessions.records).toHaveLength(9);
    expect(result.statementItems.records).toHaveLength(8);
    expect(result.statements.records[0]).toMatchObject({
      totalVnd: 1600000,
      paidVnd: 1000000,
      remainingVnd: 600000,
    });
    expect(result.students.csv).toContain('Lan, ""Hà""\nBuổi đàn');
    expect(result.students.csv).toContain('"\t+84900000000"');
    expect(result.students.csv).toContain('"\t=HYPERLINK(');
    expect(result.students.records[0].privateNote).toBe(
      '=HYPERLINK("https://example.test")',
    );
    expect(result.payments.records[0].privateNote).toBe("Khoản thu riêng");
    expect(
      new Set(Object.values(result).map((page) => page.exportedAt)).size,
    ).toBe(1);
    const all = JSON.stringify(result);
    expect(all).not.toContain(tb.uid);
    expect(all).not.toContain("activeShareTokenHash");
    expect(all).not.toContain("requestId");
  });
  it("phân trang snapshot không bỏ sót và không trộn giá mới; phiên hết hạn/tamper bị chặn", async () => {
    const now = Timestamp.now(),
      batch = admin().db.batch();
    for (let i = 0; i < 115; i++)
      batch.create(
        root()
          .collection("students")
          .doc(`page-${String(i).padStart(3, "0")}`),
        {
          displayName: `Học viên ${i}`,
          defaultRateVnd: 100000,
          contactName: "",
          phone: "",
          privateNote: "",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
        },
      );
    await batch.commit();
    const id = (
      await (
        await a.call("/api/exports", "POST", { dataset: "students" })
      ).json()
    ).id;
    await a.call(`/api/students/${studentId}`, "PATCH", {
      displayName: "Tên mới",
      defaultRateVnd: 250000,
    });
    const extra = await a.call("/api/students", "POST", {
      displayName: "Thêm sau snapshot",
      defaultRateVnd: 300000,
    });
    expect(extra.status).toBe(200);
    const values: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    let csv = "";
    do {
      const query = new URLSearchParams({
        dataset: "students",
        limit: "17",
        ...(cursor ? { cursor } : {}),
      });
      const response = await a.call(`/api/exports/${id}?${query}`);
      expect(response.status).toBe(200);
      const page: ExportPage = await response.json();
      values.push(...page.records);
      csv += page.csv;
      cursor = page.nextCursor;
    } while (cursor);
    expect(values).toHaveLength(116);
    expect(new Set(values.map((value) => value.id)).size).toBe(116);
    expect(values.find((value) => value.id === studentId)).toMatchObject({
      defaultRateVnd: 200000,
      displayName: 'Lan, "Hà"\nBuổi đàn',
    });
    expect(csv.match(/Mã học viên/g)).toHaveLength(1);
    expect(csv).not.toContain("Thêm sau snapshot");
    expect((await a.call(`/api/exports/${id}?dataset=payments`)).status).toBe(
      400,
    );
    expect(
      (await a.call(`/api/exports/${id}?dataset=students&cursor=../other`))
        .status,
    ).toBe(400);
    await root()
      .collection("dataExports")
      .doc(id)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    expect((await a.call(`/api/exports/${id}?dataset=students`)).status).toBe(
      410,
    );
  });
  it("xóa cần recent Google đúng UID/đủ consent/CSRF; API không nhận owner hoặc operator", async () => {
    for (const extra of [
      { confirmation: "xóa" },
      { acknowledged: false },
      { ownerUid: tb.uid },
      { operator: true },
    ])
      expect((await start({ ...body(), ...extra })).status).toBe(400);
    expect((await start(body(tb.idToken))).status).toBe(403);
    const pieces = ta.idToken.split("."),
      payload = JSON.parse(Buffer.from(pieces[1], "base64url").toString());
    payload.auth_time = Math.floor(Date.now() / 1000) - 600;
    pieces[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect([401, 403]).toContain((await start(body(pieces.join(".")))).status);
    expect(
      (
        await a.call(
          "/api/account/deletion/start",
          "POST",
          body(),
          randomUUID(),
          { "x-csrf-token": "wrong" },
        )
      ).status,
    ).toBe(403);
    expect((await accountControlRef(uid).get()).exists).toBe(false);
    const missing = await a.call("/api/account/deletion");
    expect(missing.status).toBe(401);
    expect(
      missing.headers
        .getSetCookie()
        .some((value) => value.startsWith("chotcong_session=")),
    ).toBe(false);
    expect((await b.call("/api/profile")).status).toBe(200);
  });
  it("khóa ghi ngay, tắt public ngay, xóa mọi tree/orphan/tokens nhiều trang/Auth; giữ B và tombstone không có PII", async () => {
    const classResponse = await a.call("/api/classes", "POST", {
      displayName: "Lớp cần xóa",
      studentIds: [studentId],
      rateVnd: 150000,
    });
    expect(classResponse.status).toBe(200);
    const classId = (await classResponse.json()).id;
    expect(
      (
        await a.call("/api/lessons", "POST", {
          classId,
          studentIds: [studentId],
          rateVnd: 150000,
          sessionDate: vietnamToday(),
          status: "completed",
          billable: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await a.call("/api/appearance", "PATCH", { theme: "chapter-desk" }))
        .status,
    ).toBe(200);
    const p = await (
      await a.call(`/api/statements/${statementId}/public-preview`)
    ).json();
    const link = await (
      await a.call(`/api/statements/${statementId}/share`, "POST", {
        version: p.version,
        previewHash: p.previewHash,
      })
    ).json();
    const publicRead = () =>
      fetch(origin + "/api/share/resolve", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ token: link.token }),
      });
    expect((await publicRead()).status).toBe(200);
    const orphan = root()
      .collection("unknown")
      .doc("missing-parent")
      .collection("nested")
      .doc("keep-until-delete");
    await orphan.set({ privateValue: "Only A" });
    const batch = admin().db.batch();
    for (let i = 0; i < 103; i++)
      batch.set(
        admin().db.doc(
          `apps/chotcong/shareTokens/${createHash("sha256")
            .update(uid + String(i))
            .digest("hex")}`,
        ),
        {
          ownerUid: uid,
          statementId,
          expiresAt: Timestamp.fromMillis(1),
          revokedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          schemaVersion: 1,
        },
      );
    const otherToken = admin().db.doc(
      `apps/chotcong/shareTokens/${randomBytes(32).toString("hex")}`,
    );
    batch.set(otherToken, {
      ownerUid: tb.uid,
      statementId: "other",
      expiresAt: Timestamp.now(),
      revokedAt: null,
      createdAt: Timestamp.now(),
      schemaVersion: 1,
    });
    await batch.commit();
    const exportId = (
      await (await a.call("/api/exports", "POST", { dataset: "all" })).json()
    ).id;
    const response = await start();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = proofFrom(response);
    expect(
      response.headers
        .getSetCookie()
        .find((value) => value.startsWith(DELETION_COOKIE + "=")),
    ).toMatch(/HttpOnly.*SameSite=lax/i);
    const job = (await accountControlRef(uid).get()).data()!;
    expect(job.phase).toBe("revoke");
    expect(JSON.stringify(job)).not.toContain(cookie.split(".")[1]);
    expect(
      (
        await a.call("/api/students", "POST", {
          displayName: "Không được ghi",
          defaultRateVnd: 1,
        })
      ).status,
    ).toBe(423);
    expect(
      (await a.call(`/api/exports/${exportId}?dataset=students`)).status,
    ).toBe(423);
    expect((await publicRead()).status).toBe(404);
    const forged = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    expect((await deletion(forged)).status).toBe(401);
    expect(
      (await deletion(cookie, "POST", { operator: true, ownerUid: tb.uid }))
        .status,
    ).toBe(400);
    await finish(cookie);
    expect((await deletion(cookie)).status).toBe(200);
    expect((await (await deletion(cookie)).json()).phase).toBe("done");
    expect((await root().get()).exists).toBe(false);
    expect((await orphan.get()).exists).toBe(false);
    expect((await root().collection("students").get()).empty).toBe(true);
    expect((await root().collection("payments").get()).empty).toBe(true);
    for (const collection of ["classes", "lessons", "preferences"])
      expect((await root().collection(collection).get()).empty).toBe(true);
    expect(
      (
        await admin()
          .db.collection("apps/chotcong/shareTokens")
          .where("ownerUid", "==", uid)
          .get()
      ).empty,
    ).toBe(true);
    expect((await otherToken.get()).exists).toBe(true);
    await expect(admin().auth.getUser(uid)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    expect((await admin().auth.getUser(tb.uid)).uid).toBe(tb.uid);
    expect(
      (
        await b.call("/api/students", "POST", {
          displayName: "B vẫn dùng",
          defaultRateVnd: 1,
        })
      ).status,
    ).toBe(200);
    expect(await ensureProfile(uid, "Không được tạo lại", null)).toBe(false);
    await expect(
      saveStudent(
        uid,
        { displayName: "Không được ghi lại", defaultRateVnd: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 423 });
    const done = (await accountControlRef(uid).get()).data()!;
    expect(done.ownerUid).toBeNull();
    expect(done.startRequestId).toBeNull();
    expect(JSON.stringify(done)).not.toContain(uid);
    expect(JSON.stringify(done)).not.toContain("Hằng");
    expect(JSON.stringify(done)).not.toContain(ta.idToken);
  });
  it("Google đăng nhập mới tiếp tục job và đổi proof; lease tránh hai worker; timeout Auth có thể retry", async () => {
    const cookie = proofFrom(await start());
    const revoked = await deletion(cookie, "POST");
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).phase).toBe("shares");
    const fresh = await googleToken(sub);
    expect(fresh.uid).toBe(uid);
    const session = await a.call("/api/auth/session", "POST", {
      idToken: fresh.idToken,
    });
    expect(session.status).toBe(200);
    expect((await session.json()).redirect).toBe("/account/deletion");
    const renewed = proofFrom(session);
    expect((await deletion(cookie)).status).toBe(401);
    await accountControlRef(uid).update({
      leaseId: randomUUID(),
      leaseUntil: Timestamp.fromMillis(Date.now() + 60000),
    });
    const busy = await deletion(renewed, "POST");
    expect(await busy.json()).toMatchObject({ phase: "shares", busy: true });
    await accountControlRef(uid).update({
      leaseUntil: Timestamp.fromMillis(1),
    });
    for (let i = 0; i < 5; i++) {
      const current = await (await deletion(renewed)).json();
      if (current.phase === "auth") break;
      expect((await deletion(renewed, "POST")).status).toBe(200);
    }
    expect((await (await deletion(renewed)).json()).phase).toBe("auth");
    vi.spyOn(admin().auth, "deleteUser").mockRejectedValueOnce(
      new Error("simulated transport failure"),
    );
    await expect(
      advanceDeletion(renewed.slice(DELETION_COOKIE.length + 1)),
    ).rejects.toMatchObject({ status: 503 });
    const failed = (await accountControlRef(uid).get()).data()!;
    expect(failed.phase).toBe("auth");
    expect(failed.leaseId).toBeNull();
    expect(failed.failedAt).toBeInstanceOf(Timestamp);
    vi.restoreAllMocks();
    // Simulate success followed by a lost response before the job checkpoint.
    await admin().auth.deleteUser(uid);
    await finish(renewed);
    expect((await (await deletion(renewed)).json()).phase).toBe("done");
    expect((await root().get()).exists).toBe(false);
  });
  it("ghi cạnh tranh không vượt qua khóa xóa; thiếu proof không thể điều khiển worker", async () => {
    const pair = await Promise.all([
      start(),
      a.call("/api/students", "POST", {
        displayName: "Ghi đồng thời",
        defaultRateVnd: 1,
      }),
    ]);
    expect(pair[0].status).toBe(200);
    expect([200, 423]).toContain(pair[1].status);
    const cookie = proofFrom(pair[0]);
    for (const path of [
      "/api/students",
      "/api/sessions",
      "/api/statements",
      "/api/exports",
    ])
      expect((await a.call(path, "POST", {})).status).toBe(423);
    expect((await a.call("/api/account/deletion", "POST", {})).status).toBe(
      401,
    );
    expect((await deletion(cookie, "POST", {})).status).toBe(200);
    // Firebase revocation uses whole seconds; the account lock denies access
    // during the same-second boundary as well.
    expect([401, 423]).toContain((await a.call("/api/profile")).status);
    expect((await b.call("/api/summary")).status).toBe(200);
    expect(
      (
        await admin()
          .db.doc(`apps/chotcong/accountDeletions/${accountKey(tb.uid)}`)
          .get()
      ).exists,
    ).toBe(false);
  });
});
