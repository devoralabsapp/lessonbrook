import { z } from "zod";
import { mobileProofSchema } from "@/domain/mobile-sign-in";
import { admin } from "@/lib/firebase/admin";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { AppError } from "@/lib/server/errors";
import { getGuestTheme } from "@/lib/server/guest-theme";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import { redeemMobileSignIn } from "@/lib/server/mobile-sign-in";
import { ensureProfile } from "@/lib/server/repository";
import { cookieOptions, SESSION_COOKIE } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await checkMutation(request);
    if (!hasFirebaseServerConfig()) {
      throw new AppError(
        503,
        "Ứng dụng đang được thiết lập. Vui lòng quay lại sau.",
      );
    }
    const { code, verifier } = z
      .object({
        code: mobileProofSchema,
        verifier: mobileProofSchema,
      })
      .strict()
      .parse(await jsonBody(request));
    const session = await redeemMobileSignIn(code, verifier);
    const user = await admin()
      .auth.verifySessionCookie(session, true)
      .catch(() => {
        throw new AppError(
          401,
          "Phiên đăng nhập trên ứng dụng đã hết hạn. Vui lòng thử lại.",
        );
      });
    const ready = await ensureProfile(
      user.uid,
      user.name ?? "Giáo viên",
      user.email ?? null,
      await getGuestTheme(),
    );
    if (!ready) throw new AppError(423, "Tài khoản đang được xóa hoặc đã xóa.");
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, session, {
      ...cookieOptions(),
      maxAge: Math.max(0, user.exp - Math.floor(Date.now() / 1000)),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
