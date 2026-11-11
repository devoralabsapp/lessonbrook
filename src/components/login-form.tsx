"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { clientAuth } from "@/lib/firebase/client";
import { api } from "@/lib/client-api";
import { InfoLinks } from "./info-links";
import { useAuthReady } from "@/lib/firebase/use-auth-ready";
import { authErrorMessage } from "@/lib/firebase/auth-errors";
import type { Theme } from "@/domain/appearance";
import { MOBILE_SCHEME, mobileProofSchema } from "@/domain/mobile-sign-in";
export function LoginForm({
  serverConfigured,
  theme,
  inApp,
  nativeGoogleSignIn,
}: {
  serverConfigured: boolean;
  theme: Theme;
  inApp: boolean;
  nativeGoogleSignIn: boolean;
}) {
  const { t } = useI18n();
  const configured = Boolean(
    serverConfigured &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileCode, setMobileCode] = useState<string | null>(null);
  const preparation = useAuthReady(configured && !inApp && !mobileCode);
  const running = useRef(false);
  const params = useSearchParams();
  const mobileSignInLabel = nativeGoogleSignIn
    ? t("Tiếp tục với Google")
    : t("Đăng nhập Google trong trình duyệt");
  async function login() {
    if (running.current || !preparation.ready) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const auth = clientAuth();
      const mobileChallenge = mobileProofSchema.safeParse(
        params.get("mobileChallenge"),
      ).data;
      try {
        // Keep the SDK call in the button handler, before any awaited work.
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        const session = await api<{
          redirect?: string;
          mobileCode?: string;
        }>("/api/auth/session", {
          method: "POST",
          body: { idToken: await result.user.getIdToken(), mobileChallenge },
        });
        if (session.redirect === "/account/deletion") {
          window.location.assign(session.redirect);
          return;
        }
        if (mobileChallenge) {
          setMobileCode(mobileProofSchema.parse(session.mobileCode));
          return;
        }
      } finally {
        await signOut(auth);
      }
      window.location.assign(
        params.get("next") === "data" ? "/app/settings#account-data" : "/app",
      );
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
      running.current = false;
    }
  }
  return (
    <main
      data-theme={theme}
      className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2"
    >
      <section className="hidden flex-col justify-between bg-accent-soft p-12 lg:flex">
        <Brand />
        <div className="max-w-lg">
          <BookOpen className="mb-10 text-primary" size={44} strokeWidth={1} />
          <h1 className="serif text-5xl leading-tight">
            {t("Dành tâm trí")}
            <br />
            {t("cho những buổi dạy.")}
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-foreground">
            {t(
              "Từng học viên, từng buổi học, từng đơn giá — gọn gàng trong một cuốn sổ của riêng bạn.",
            )}
          </p>
        </div>
        <p className="text-xs text-foreground">
          {t("LessonBrook · Sổ buổi dạy & học phí")}
        </p>
      </section>
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground"
        >
          <ArrowLeft size={14} />
          {t(" Về trang giới thiệu")}
        </Link>
        <div className="mx-auto my-auto w-full max-w-sm py-14">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <div className="mb-5 flex justify-end">
            <LanguageSwitcher />
          </div>
          <p className="mb-3 text-xs font-semibold tracking-[.18em] text-primary">
            {t("MỘT CUỐN SỔ NHẸ NHÀNG HƠN")}
          </p>
          <h2 className="serif text-4xl">{t("Chào bạn.")}</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {t("Đăng nhập để mở sổ buổi dạy của bạn.")}
            <br />
            {t("Học viên không cần tạo tài khoản.")}
          </p>
          {params.has("expired") && (
            <p
              role="status"
              className="mt-5 rounded-xl bg-warning-soft p-3 text-sm text-warning-foreground"
            >
              {t("Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.")}
            </p>
          )}
          {mobileCode || (inApp && configured) ? (
            <Button asChild variant="outline" className="mt-8 h-12 w-full">
              <a
                href={
                  mobileCode
                    ? `${MOBILE_SCHEME}://finish?code=${mobileCode}`
                    : `${MOBILE_SCHEME}://start`
                }
              >
                {mobileCode ? t("Mở LessonBrook") : mobileSignInLabel}
                <ArrowRight className="ml-auto" />
              </a>
            </Button>
          ) : (
            <Button
              onClick={login}
              disabled={busy || !configured || !preparation.ready}
              variant="outline"
              className="mt-8 h-12 w-full"
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <span className="text-base font-bold text-primary">G</span>
              )}
              {busy
                ? t("Đang đăng nhập…")
                : configured && !preparation.ready && !preparation.error
                  ? t("Đang chuẩn bị đăng nhập…")
                  : t("Tiếp tục với Google")}
              {!busy && <ArrowRight className="ml-auto" />}
            </Button>
          )}
          {!configured && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-warning-soft p-3 text-sm leading-6 text-warning-foreground"
            >
              {t("Ứng dụng đang được thiết lập. Đăng nhập sẽ được mở sau.")}
            </p>
          )}
          {(error || preparation.error) && (
            <p role="alert" className="mt-4 text-sm leading-6 text-destructive">
              {t(error || preparation.error)}
            </p>
          )}
          {preparation.error && (
            <Button
              className="mt-3"
              variant="outline"
              onClick={preparation.retry}
            >
              {t("Thử chuẩn bị lại")}
            </Button>
          )}
          {!inApp && !mobileCode && (
            <details className="mt-5 text-xs leading-6 text-muted-foreground">
              <summary className="cursor-pointer text-primary">
                {t("Popup bị chặn hoặc báo thiếu trạng thái?")}
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>
                  {t(
                    "Cho phép cửa sổ bật lên cho trang LessonBrook trong trình duyệt.",
                  )}
                </li>
                <li>
                  {t(
                    "Đóng cửa sổ đang báo lỗi, quay lại trang này và nhấn nút Google để bắt đầu lần mới. Không mở lại đường dẫn đăng nhập cũ từ lịch sử.",
                  )}
                </li>
                <li>
                  {t(
                    "Nếu mở từ Zalo/Facebook, dùng menu để mở LessonBrook bằng Safari hoặc Chrome. Giữ nguyên trình duyệt trong suốt lần đăng nhập.",
                  )}
                </li>
              </ol>
            </details>
          )}
          <div className="mt-8 flex gap-3 border-t border-border pt-6">
            <ShieldCheck size={19} className="shrink-0 text-primary" />
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Dữ liệu buổi dạy thuộc tài khoản của bạn. Đơn giá được lưu riêng cho từng buổi. Cần kết nối mạng để lưu thay đổi.",
              )}
            </p>
          </div>
          <div className="mt-6">
            <InfoLinks />
          </div>
          {process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" && (
            <p className="mt-6 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning-foreground">
              {t(
                "Firebase Emulator · Môi trường thử nghiệm cục bộ. Chỉ sử dụng dữ liệu giả; đăng nhập này không xác minh tài khoản Google thật.",
              )}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
