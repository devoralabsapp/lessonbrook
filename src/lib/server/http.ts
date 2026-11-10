import "server-only";
import { getI18n } from "@/lib/i18n/server";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { AppError } from "./errors";
import {
  appOrigin,
  cookieOptions,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "./session";
export async function checkMutation(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new AppError(403, "Nguồn yêu cầu không hợp lệ.");
  const token = request.headers.get("x-csrf-token") ?? "";
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value ?? "";
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !/^[a-f0-9]{64}$/.test(cookie) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(cookie))
  )
    throw new AppError(403, "Phiên bảo mật hết hạn. Vui lòng tải lại trang.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Yêu cầu phải là JSON.");
}
export async function jsonBody(request: Request): Promise<unknown> {
  // Bound the streamed body; Content-Length alone is not trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new AppError(413, "Dữ liệu quá lớn.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON không hợp lệ.");
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function errorResponse(error: unknown) {
  const { t } = await getI18n();
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message
      : error instanceof AppError
        ? error.message
        : "Không thể xử lý lúc này. Vui lòng thử lại.";
  if (status === 500)
    console.error(
      "Server request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  const response = json(
    { error: t(message ?? "Không thể xử lý lúc này. Vui lòng thử lại.") },
    status,
  );
  if (status === 401)
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
