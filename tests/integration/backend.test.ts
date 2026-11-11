import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { client, googleToken, origin } from "./helpers";
import { getSession } from "@/lib/server/repository";
import { GUEST_THEME_COOKIE } from "@/domain/appearance";
describe("Next HTTP + Auth/Firestore Emulator", () => {
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    uidA: string,
    studentId: string,
    sessionId: string;
  const student = { displayName: "Lan", defaultRateVnd: 200000 };
  beforeAll(async () => {
    a = await client();
    b = await client();
    const ta = await googleToken();
    const tb = await googleToken();
    uidA = ta.uid;
    await a.login(ta.idToken);
    await b.login(tb.idToken);
  });
  it("cookie HttpOnly/Lax, dữ liệu route riêng yêu cầu phiên", async () => {
    const r = await fetch(origin + "/api/students");
    expect(r.status).toBe(401);
    const page = await fetch(origin + "/app", { redirect: "manual" });
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login");
    const t = await googleToken();
    const c = await client();
    const login = await c.login(t.idToken);
    const cookie = login.headers.getSetCookie().join(";");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Max-Age=432000");
  });
  it("Origin/CSRF sai và token sai bị từ chối", async () => {
    expect(
      (
        await a.call("/api/students", "POST", student, randomUUID(), {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await a.call("/api/students", "POST", student, randomUUID(), {
          "x-csrf-token": "0".repeat(64),
        })
      ).status,
    ).toBe(403);
    expect(
      (await a.call("/api/auth/session", "POST", { idToken: "invalid" }))
        .status,
    ).toBe(401);
  });
  it("sign-in applies a valid guest theme to the verified account and preserves it on later sign-ins", async () => {
    const c = await client();
    const { idToken } = await googleToken();
    await c.login(idToken);
    expect(
      (await c.call("/api/appearance", "PATCH", { theme: "ocean" })).status,
    ).toBe(200);

    const loginWithTheme = (theme: string) =>
      c.call("/api/auth/session", "POST", { idToken }, randomUUID(), {
        Cookie: `${c.csrfCookie}; ${GUEST_THEME_COOKIE}=${theme}`,
      });
    const savedTheme = async () =>
      (await (await c.call("/api/appearance")).json()).theme;

    const login = await loginWithTheme("visual-code");
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(`^${GUEST_THEME_COOKIE}=;.*Max-Age=0`),
        ),
      ]),
    );
    expect(await savedTheme()).toBe("visual-code");

    expect((await loginWithTheme("invalid")).status).toBe(200);
    expect((await c.login(idToken)).status).toBe(200);
    expect(await savedTheme()).toBe("visual-code");
  });
  it("hands a Google session to only the app with the matching proof and preserves its theme", async () => {
    const browser = await client();
    const app = await client();
    const googleSubject = randomUUID();
    const { idToken } = await googleToken(googleSubject);
    const verifier = randomBytes(32).toString("base64url");
    const mobileChallenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const issue = await browser.call("/api/auth/session", "POST", {
      idToken,
      mobileChallenge,
    });
    expect(issue.status).toBe(200);
    expect(issue.headers.getSetCookie()).toEqual([]);
    const { mobileCode: code } = await issue.json();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await browser.call("/api/profile")).status).toBe(401);

    const redeem = (proof: string) =>
      app.call(
        "/api/auth/mobile",
        "POST",
        { code, verifier: proof },
        randomUUID(),
        { Cookie: `${app.csrfCookie}; ${GUEST_THEME_COOKIE}=playful-retro` },
      );
    expect((await redeem(randomBytes(32).toString("base64url"))).status).toBe(
      401,
    );
    const attempts = await Promise.all([redeem(verifier), redeem(verifier)]);
    expect(attempts.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const session = attempts
      .find((response) => response.ok)!
      .headers.getSetCookie()[0];
    expect(session).toMatch(/^chotcong_session=.+;.*HttpOnly;.*SameSite=lax/);
    const headers = { Cookie: `${app.csrfCookie}; ${session.split(";")[0]}` };
    const profile = await app.call(
      "/api/profile",
      "GET",
      undefined,
      randomUUID(),
      headers,
    );
    expect(await profile.json()).toMatchObject({
      email: `${googleSubject}@example.test`,
    });
    const appearance = await app.call(
      "/api/appearance",
      "GET",
      undefined,
      randomUUID(),
      headers,
    );
    expect(await appearance.json()).toMatchObject({ theme: "playful-retro" });
  });
  it("chặn CSRF Unicode và request quá lớn", async () => {
    expect(
      (
        await a.call("/api/students", "POST", student, randomUUID(), {
          "x-csrf-token": "é".repeat(64),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await a.call("/api/students", "POST", {
          ...student,
          privateNote: "x".repeat(20000),
        })
      ).status,
    ).toBe(413);
  });
  it("yêu cầu đăng nhập gần đây và từ chối phiên hết hạn", async () => {
    const token = await googleToken();
    const c = await client();
    const pieces = token.idToken.split(".");
    const payload = JSON.parse(Buffer.from(pieces[1], "base64url").toString());
    payload.auth_time = Math.floor(Date.now() / 1000) - 600;
    pieces[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(
      (await c.call("/api/auth/session", "POST", { idToken: pieces.join(".") }))
        .status,
    ).toBe(401);
    await c.login(token.idToken);
    const cookie = c.session.split("=").slice(1).join("=").split(".");
    const claims = JSON.parse(Buffer.from(cookie[1], "base64url").toString());
    claims.exp = Math.floor(Date.now() / 1000) - 1;
    cookie[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect(
      (
        await c.call("/api/profile", "GET", undefined, randomUUID(), {
          Cookie: `${c.csrfCookie}; chotcong_session=${cookie.join(".")}`,
        })
      ).status,
    ).toBe(401);
    // Editing unsigned tokens is supported only in Auth Emulator; cloud signature checks stay enabled.
  });
  it("tạo học viên idempotent và từ chối payload đổi khóa cũ", async () => {
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      a.call("/api/students", "POST", student, key),
      a.call("/api/students", "POST", student, key),
    ]);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    const x = await first.json();
    expect(await retry.json()).toEqual(x);
    studentId = x.id;
    expect(
      (
        await a.call(
          "/api/students",
          "POST",
          { ...student, displayName: "Khác" },
          key,
        )
      ).status,
    ).toBe(409);
  });
  it("B không đọc/sửa/liên kết ID của A và không chọn UID từ client", async () => {
    expect((await b.call(`/api/students/${studentId}`)).status).toBe(404);
    expect(
      (await b.call(`/api/students/${studentId}`, "PATCH", student)).status,
    ).toBe(404);
    expect(
      (
        await b.call(`/api/students/${studentId}/archive`, "POST", {
          archived: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.call("/api/sessions", "POST", {
          studentId,
          sessionDate: "2026-10-15",
          status: "completed",
          billable: true,
        })
      ).status,
    ).toBe(404);
    expect((await b.call(`/api/sessions?studentId=${studentId}`)).status).toBe(
      404,
    );
    expect(
      (await a.call("/api/students", "POST", { ...student, ownerId: "B" }))
        .status,
    ).toBe(400);
    expect((await b.call("/api/students")).status).toBe(200);
    expect((await (await b.call("/api/students")).json()).items).toEqual([]);
  });
  it("buổi retry không nhân đôi, giá snapshot không đổi sau sửa học viên", async () => {
    const body = {
      studentId,
      sessionDate: "2026-10-15",
      status: "completed",
      billable: true,
    };
    const key = randomUUID();
    const first = await a.call("/api/sessions", "POST", body, key);
    expect(first.status).toBe(200);
    sessionId = (await first.json()).id;
    expect(
      (await (await a.call("/api/sessions", "POST", body, key)).json()).id,
    ).toBe(sessionId);
    await a.call(`/api/students/${studentId}`, "PATCH", {
      ...student,
      defaultRateVnd: 250000,
    });
    expect((await getSession(uidA, sessionId)).rateVnd).toBe(200000);
    await a.call(`/api/sessions/${sessionId}`, "PATCH", {
      ...body,
      privateNote: "Sửa ghi chú, giữ giá",
    });
    expect((await getSession(uidA, sessionId)).rateVnd).toBe(200000);
    const next = await (await a.call("/api/sessions", "POST", body)).json();
    expect((await getSession(uidA, next.id)).rateVnd).toBe(250000);
    expect((await b.call(`/api/sessions/${sessionId}`)).status).toBe(404);
    expect(
      (await b.call(`/api/sessions/${sessionId}`, "PATCH", body)).status,
    ).toBe(404);
  });
  it("giá riêng, miễn phí, hủy, ngày sai và khóa buổi đã lập bảng kê", async () => {
    const body = {
      studentId,
      sessionDate: "2026-10-16",
      status: "completed",
      billable: false,
      rateVnd: 123000,
    };
    const free = await (await a.call("/api/sessions", "POST", body)).json();
    expect((await getSession(uidA, free.id)).amountVnd).toBe(0);
    expect(
      (
        await a.call("/api/sessions", "POST", {
          ...body,
          status: "cancelled",
          billable: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call("/api/sessions", "POST", {
          ...body,
          sessionDate: "2026-02-30",
        })
      ).status,
    ).toBe(400);
    expect(
      (await a.call("/api/sessions", "POST", { ...body, rateVnd: 1.1 })).status,
    ).toBe(400);
    const ref = admin().db.doc(
      `apps/chotcong/users/${uidA}/sessions/${free.id}`,
    );
    await ref.update({ billedStatementId: "issued-test" });
    expect(
      (await a.call(`/api/sessions/${free.id}`, "PATCH", body)).status,
    ).toBe(409);
  });
  it("phân trang có tie-breaker, ngày đầu/cuối được tính, tổng quan không cộng một trang", async () => {
    const first = await (
      await a.call(
        `/api/sessions?studentId=${studentId}&from=2026-10-15&to=2026-10-15&limit=1`,
      )
    ).json();
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await (
      await a.call(
        `/api/sessions?studentId=${studentId}&from=2026-10-15&to=2026-10-15&limit=1&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(second.items[0].id).not.toBe(first.items[0].id);
    const summary = await (await a.call("/api/summary")).json();
    expect(summary.unbilledCount).toBe(2);
    expect(summary.unbilledVnd).toBe(450000);
    expect(
      (await a.call("/api/sessions?from=2026-10-16&to=2026-10-15")).status,
    ).toBe(400);
  });
  it("lưu trữ giữ lịch sử, chặn buổi mới, khôi phục cho thêm lại", async () => {
    await a.call(`/api/students/${studentId}/archive`, "POST", {
      archived: true,
    });
    expect((await a.call(`/api/sessions/${sessionId}`)).status).toBe(200);
    expect(
      (
        await a.call("/api/sessions", "POST", {
          studentId,
          sessionDate: "2026-10-17",
          status: "planned",
          billable: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (await (await a.call("/api/students?archived=true")).json()).items,
    ).toHaveLength(1);
    await a.call(`/api/students/${studentId}/archive`, "POST", {
      archived: false,
    });
    expect(
      (
        await a.call("/api/sessions", "POST", {
          studentId,
          sessionDate: "2026-10-17",
          status: "planned",
          billable: true,
        })
      ).status,
    ).toBe(200);
  });
  it("thu hồi phiên chặn request và logout xóa cookie", async () => {
    // auth_time and tokensValidAfterTime have second precision.
    await new Promise((r) => setTimeout(r, 1100));
    await admin().auth.revokeRefreshTokens(uidA);
    const invalid = await a.call("/api/profile");
    expect(invalid.status).toBe(401);
    expect(invalid.headers.getSetCookie().join()).toContain("Max-Age=0");
    const logout = await b.call("/api/auth/logout", "POST", {});
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().join()).toContain("Max-Age=0");
  });
});
