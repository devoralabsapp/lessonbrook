import "server-only";
import { cookies } from "next/headers";
import { admin } from "@/lib/firebase/admin";
import { AppError } from "./errors";
import { assertAccountAvailable } from "./account-access";
export const SESSION_COOKIE = "chotcong_session";
export const CSRF_COOKIE = "chotcong_csrf";
export const SESSION_SECONDS = 60 * 60 * 24 * 5;
export function appOrigin() {
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin)
    throw new Error("APP_ORIGIN phải là origin đầy đủ, không có dấu / cuối.");
  if (
    !origin.startsWith("https://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  )
    throw new Error("HTTP chỉ dùng cho loopback local.");
  return origin;
}
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
  };
}
export async function verifyUserSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value)
    throw new AppError(
      401,
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    );
  const { auth } = admin();
  return auth.verifySessionCookie(value, true).catch(() => {
    throw new AppError(401, "Phiên đăng nhập đã hết hạn hoặc bị thu hồi.");
  });
}
export async function requireUser(options?: { allowDeleting?: boolean }) {
  const user = await verifyUserSession();
  if (!options?.allowDeleting) await assertAccountAvailable(user.uid);
  return user;
}
