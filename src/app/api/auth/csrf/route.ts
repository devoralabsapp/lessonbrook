import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { json } from "@/lib/server/http";
import { cookieOptions, CSRF_COOKIE } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const current = (await cookies()).get(CSRF_COOKIE)?.value ?? "";
  // Preparing forms in another tab must not invalidate an active form.
  const token = /^[a-f0-9]{64}$/.test(current)
    ? current
    : randomBytes(32).toString("hex");
  const response = json({ token });
  response.cookies.set(CSRF_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 3600,
  });
  return response;
}
