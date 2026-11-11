import { randomUUID } from "node:crypto";
import { assertEmulators } from "../../scripts/emulator-guard";
assertEmulators();
export const origin = "http://localhost:3000";
export async function googleToken(uid = crypto.randomUUID()) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: new URLSearchParams({
          providerId: "google.com",
          id_token: JSON.stringify({
            sub: uid,
            email: `${uid}@example.test`,
            name: "Giáo viên thử nghiệm",
            email_verified: true,
          }),
        }).toString(),
        requestUri: origin,
        returnSecureToken: true,
      }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return {
    idToken: data.idToken as string,
    uid: data.localId as string,
    refreshToken: data.refreshToken as string,
  };
}
export async function client(locale: "en" | "vi" = "vi") {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const { token } = await csrfResponse.json();
  const csrfCookie =
    csrfResponse.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ") + `; chotcong_locale=${locale}`;
  let session = "";
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    key = randomUUID(),
    extra?: Record<string, string>,
  ) =>
    fetch(origin + path, {
      method,
      headers: {
        Cookie: `${csrfCookie}; ${session}`,
        Origin: origin,
        "Content-Type": "application/json",
        "x-csrf-token": token,
        "Idempotency-Key": key,
        ...extra,
      },
      body: method !== "GET" ? JSON.stringify(body ?? {}) : undefined,
    });
  return {
    call,
    token,
    csrfCookie,
    get session() {
      return session;
    },
    async login(idToken: string) {
      const r = await call("/api/auth/session", "POST", { idToken });
      if (!r.ok) throw new Error(await r.text());
      session = r.headers
        .getSetCookie()
        .find((c) => c.startsWith("chotcong_session="))!
        .split(";")[0];
      return r;
    },
  };
}
