"use client";
import { useI18n } from "@/lib/i18n/client";

import { LanguageSwitcher } from "./language-switcher";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Settings, Sprout } from "lucide-react";
import { WorkspaceNavigation, workspaceTabs } from "./workspace-navigation";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { api, csrfToken } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useAppearancePreview } from "@/lib/use-appearance-preview";
import { AppearanceContext, AppearancePicker } from "./appearance";
import { DEFAULT_THEME, type Theme } from "@/domain/appearance";
export function AppShell({
  name,
  initialTheme = DEFAULT_THEME,
  embedded = false,
  nativeChrome = false,
  children,
}: {
  name: string;
  initialTheme?: Theme;
  embedded?: boolean;
  nativeChrome?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const appearance = useAppearancePreview(initialTheme, path);
  const activeLink = (href: string) =>
    href === "/app"
      ? path === href
      : path.startsWith(href) ||
        (href === "/app/sessions" &&
          (path.startsWith("/app/lessons") || path === "/app/schedule"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!nativeChrome) return;
    function navigate(event: Event) {
      const target: unknown = (event as CustomEvent).detail;
      if (!workspaceTabs.some(({ href }) => href !== "/app" && href === target))
        return;
      event.preventDefault();
      if (typeof target === "string" && target !== path) router.replace(target);
    }
    window.addEventListener("lessonbrook:navigate-tab", navigate);
    return () =>
      window.removeEventListener("lessonbrook:navigate-tab", navigate);
  }, [nativeChrome, path, router]);
  useEffect(() => {
    void csrfToken().catch(() => {
      // A failed preload is retried when the user submits a form.
    });
  }, []);
  useEffect(() => {
    let active = true;
    let pending = false;
    let initialize = true;
    async function sync() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const { created } = await api<{ created: number }>(
          "/api/class-schedule",
          {
            method: "POST",
            body: { initialize },
          },
        );
        initialize = false;
        if (active && created)
          window.dispatchEvent(new Event("class-lessons-created"));
      } catch {
        // Leave the current view available. The next check can safely retry.
      } finally {
        pending = false;
      }
    }
    void sync();
    const timer = window.setInterval(sync, 60_000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      window.location.assign("/login");
    } catch {
      setError(t("Chưa thể đăng xuất. Vui lòng thử lại."));
      setBusy(false);
    }
  }
  return (
    <AppearanceContext.Provider value={appearance}>
      <div
        data-theme={appearance.theme}
        data-saved-theme={appearance.savedTheme}
        className="min-h-dvh bg-background text-foreground"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-3"
        >
          {t("Đến nội dung")}
        </a>
        {!embedded && (
          <aside className="fixed inset-y-0 left-0 z-20 hidden w-[242px] flex-col border-r border-border bg-surface px-5 py-8 lg:flex">
            <div className="px-2">
              <Brand />
            </div>
            <p className="mb-3 mt-12 px-3 text-[10px] font-semibold tracking-[.2em] text-muted-foreground">
              {t("CUỐN SỔ CỦA BẠN")}
            </p>
            <WorkspaceNavigation
              links={workspaceTabs}
              currentHref={path}
              isActive={activeLink}
            />
            <div className="mt-auto">
              <div className="mb-6 rounded-2xl bg-accent-soft p-4">
                <Sprout size={23} className="mb-3 text-primary" />
                <p className="serif text-lg">{t("Ghi một chút mỗi ngày.")}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t("Để cuối tháng, mọi buổi dạy đều có trong sổ.")}
                </p>
              </div>
              <Link
                href="/app/settings"
                className="flex items-center gap-3 rounded-xl p-3 text-sm text-muted-foreground"
              >
                <Settings size={18} />
                {t("Cài đặt tài khoản")}
              </Link>
              <Button
                onClick={logout}
                disabled={busy}
                variant="ghost"
                className="w-full justify-start px-3 text-muted-foreground"
              >
                <LogOut />
                {busy ? t("Đang đăng xuất…") : t("Đăng xuất")}
              </Button>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {t(error)}
                </p>
              )}
            </div>
          </aside>
        )}
        <div className={embedded ? undefined : "lg:ml-[242px]"}>
          {embedded ? (
            (!nativeChrome || path === "/app/settings") && (
              <header className="relative flex justify-end gap-3 px-5 pt-3 sm:px-9">
                {path === "/app/settings" && <LanguageSwitcher />}
                {!nativeChrome && <AppearancePicker key={path} />}
              </header>
            )
          ) : (
            <header
              data-slot="workspace-header"
              className="relative flex h-[82px] items-center justify-between border-b border-border bg-surface/80 px-4 sm:px-9"
            >
              <div className="lg:hidden">
                <Brand compact />
              </div>
              <p className="hidden text-xs text-muted-foreground lg:block">
                {t("Không gian dạy học")}{" "}
                <span className="mx-2 text-muted-foreground">/</span>{" "}
                <span className="text-foreground">
                  {path.includes("students")
                    ? t("Học viên")
                    : path.includes("classes")
                      ? t("Lớp học")
                      : path.includes("sessions") ||
                          path.includes("lessons") ||
                          path === "/app/schedule"
                        ? t("Buổi dạy")
                        : path.includes("statements")
                          ? t("Bảng kê")
                          : path.includes("settings")
                            ? t("Cài đặt")
                            : path === "/onboarding"
                              ? t("Bắt đầu")
                              : t("Tổng quan")}
                </span>
              </p>
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <LanguageSwitcher compact />
                <AppearancePicker key={path} />
                <Link
                  href="/app/settings"
                  aria-label={t("Cài đặt tài khoản")}
                  className="flex items-center gap-3"
                >
                  <span className="hidden text-xs sm:block">{name}</span>
                  <span className="flex size-9 items-center justify-center rounded-full border border-border bg-accent-soft text-sm font-bold text-primary">
                    {name[0]?.toUpperCase()}
                  </span>
                </Link>
              </div>
            </header>
          )}
          {process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" && (
            <div className="bg-warning-soft px-5 py-1.5 text-center text-[11px] text-warning-foreground">
              {t("Firebase Emulator · Chỉ dùng dữ liệu giả")}
            </div>
          )}
          <main
            id="main"
            tabIndex={-1}
            className={cn(
              "mx-auto max-w-[1320px] p-5 sm:p-9",
              !embedded && "pb-28 sm:pb-28 lg:pb-9",
            )}
          >
            {children}
          </main>
        </div>
        {!embedded && (
          <WorkspaceNavigation
            mobile
            label="Điều hướng chính"
            links={workspaceTabs}
            currentHref={path}
            isActive={activeLink}
          />
        )}
      </div>
    </AppearanceContext.Provider>
  );
}
