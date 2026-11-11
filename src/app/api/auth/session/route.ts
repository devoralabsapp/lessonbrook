import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { AppError } from "@/lib/server/errors";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import { ensureProfile } from "@/lib/server/repository";
import { resumeDeletion } from "@/lib/server/account-deletion";
import { deletionResponse } from "@/lib/server/deletion-http";
import { GUEST_THEME_COOKIE } from "@/domain/appearance";
import { getGuestTheme } from "@/lib/server/guest-theme";
import { mobileProofSchema } from "@/domain/mobile-sign-in";
import { issueMobileSignIn } from "@/lib/server/mobile-sign-in";
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/server/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await checkMutation(request);
    if (!hasFirebaseServerConfig())
      throw new AppError(
        503,
        "Ứng dụng đang được thiết lập. Vui lòng quay lại sau.",
      );
    const { idToken, mobileChallenge } = z
      .object({
        idToken: z.string().min(1).max(12000),
        mobileChallenge: mobileProofSchema.optional(),
      })
      .strict()
      .parse(await jsonBody(request));
    const { auth } = admin();
    const decoded = await auth.verifyIdToken(idToken, true).catch(() => {
      throw new AppError(401, "Đăng nhập không hợp lệ. Vui lòng thử lại.");
    });
    const age = Date.now() / 1000 - decoded.auth_time;
    if (
      age < -30 ||
      age > 300 ||
      decoded.firebase.sign_in_provider !== "google.com"
    )
      throw new AppError(
        401,
        "Vui lòng đăng nhập Google lại để tạo phiên mới.",
      );
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_SECONDS * 1000,
    });
    const theme = mobileChallenge ? undefined : await getGuestTheme();
    const ready = await ensureProfile(
      decoded.uid,
      decoded.name ?? "Giáo viên",
      decoded.email ?? null,
      theme,
    );
    if (!ready) return deletionResponse(await resumeDeletion(decoded.uid));
    if (mobileChallenge)
      return json({
        mobileCode: await issueMobileSignIn(sessionCookie, mobileChallenge),
      });
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      ...cookieOptions(),
      maxAge: SESSION_SECONDS,
    });
    if (theme)
      response.cookies.set(GUEST_THEME_COOKIE, "", {
        ...cookieOptions(),
        maxAge: 0,
      });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
