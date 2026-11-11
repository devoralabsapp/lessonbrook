import "server-only";
import { z } from "zod";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { AppError } from "./errors";

const refreshedSchema = z.object({
  id_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
const expiredErrors = new Set([
  "TOKEN_EXPIRED",
  "USER_DISABLED",
  "USER_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
]);

export async function refreshFirebaseToken(refreshToken: string) {
  const unavailable = () =>
    new AppError(503, "Chưa thể làm mới phiên Firebase. Vui lòng thử lại.");
  if (!hasFirebaseServerConfig()) throw unavailable();

  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && !/^(localhost|127\.0\.0\.1):\d+$/.test(emulator))
    throw unavailable();
  const endpoint = new URL(
    emulator
      ? `http://${emulator}/securetoken.googleapis.com/v1/token`
      : "https://securetoken.googleapis.com/v1/token",
  );
  endpoint.searchParams.set("key", process.env.NEXT_PUBLIC_FIREBASE_API_KEY!);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } catch {
    throw unavailable();
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 400 && expiredErrors.has(result?.error?.message))
      return null;
    throw unavailable();
  }
  const parsed = refreshedSchema.safeParse(result);
  if (!parsed.success) throw unavailable();
  return {
    idToken: parsed.data.id_token,
    refreshToken: parsed.data.refresh_token,
  };
}
