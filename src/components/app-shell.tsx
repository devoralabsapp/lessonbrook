"use client";
import { useI18n } from "@/lib/i18n/client";

import { LanguageSwitcher } from "./language-switcher";
import Link, { useDemoWorkspace } from "@/components/workspace-link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, Settings, Sprout } from "lucide-react";
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
  androidWorkspace = false,
  legacyAndroidChrome = false,
  children,
}: {
  name: string;
  initialTheme?: Theme;
  embedded?: boolean;
  nativeChrome?: boolean;
  androidWorkspace?: boolean;
  legacyAndroidChrome?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const demo = useDemoWorkspace();
  const path = demo
    ? pathname === "/demo/onboarding"
      ? "/onboarding"
      : pathname.replace(/^\/demo/, "/app")
    : pathname;
  const router = useRouter();
  const appearance = useAppearancePreview(initialTheme, pathname);
  const [demoName, setDemoName] = useState(name);
  const displayName = demo ? demoName : name;
  const activeLink = (href: string) =>
    href === "/app"
      ? path === href
      : path.startsWith(href) ||
        (href === "/app/sessions" &&
          (path.startsWith("/app/lessons") || path === "/app/schedule"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const androidTabLocations = useRef(new Map<string, string>());
  useEffect(() => {
    if (!nativeChrome) return;
    function navigate(event: Event) {
      const target: unknown = (event as CustomEvent).detail;
      if (
        !workspaceTabs.some(
          ({ href }) =>
            (androidWorkspace || demo || href !== "/app") && href === target,
        ) &&
        !(demo && ["/app/settings", "/app/appearance"].includes(String(target)))
      )
        return;
      event.preventDefault();
      if (androidWorkspace && typeof target === "string") {
        const root = workspaceTabs.find(({ href }) =>
          href === "/app"
            ? path === href
            : path === href ||
              path.startsWith(`${href}/`) ||
              (href === "/app/sessions" &&
                (path === "/app/schedule" || path.startsWith("/app/lessons"))),
        );
        if (root && root.href !== target)
          androidTabLocations.current.set(
            root.href,
            pathname + window.location.search,
          );
        const destination = demo
          ? target.replace(/^\/app(?=\/|$)/, "/demo")
          : target;
        const next =
          root?.href === target
            ? destination
            : (androidTabLocations.current.get(target) ?? destination);
        if (next !== pathname + window.location.search) router.push(next);
        return;
      }
      if (typeof target === "string" && target !== path)
        router.replace(
          demo ? target.replace(/^\/app(?=\/|$)/, "/demo") : target,
        );
    }
    window.addEventListener("lessonbrook:navigate-tab", navigate);
    return () =>
      window.removeEventListener("lessonbrook:navigate-tab", navigate);
  }, [androidWorkspace, demo, nativeChrome, path, pathname, router]);
  useEffect(() => {
    if (demo) {
      function updateName(event: Event) {
        setDemoName((event as CustomEvent<string>).detail);
      }
      window.addEventListener("lessonbrook:demo-name", updateName);
      return () =>
        window.removeEventListener("lessonbrook:demo-name", updateName);
    }
    void csrfToken().catch(() => {
      // A failed preload is retried when the user submits a form.
    });
  }, [demo]);
  useEffect(() => {
    if (demo) return;
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
  }, [demo]);
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
  function canLeaveAndroidPage() {
    if (document.querySelector('[data-mobile-draft="saving"]')) return false;
    return (
      !document.querySelector('[data-mobile-draft="dirty"]') ||
      window.confirm(t("Bỏ các thay đổi chưa lưu?"))
    );
  }
  return (
    <AppearanceContext.Provider value={appearance}>
      <div
        data-workspace=""
        data-native-chrome={nativeChrome || undefined}
        data-android-workspace={androidWorkspace || undefined}
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
          <aside
            data-slot="workspace-sidebar"
            className="fixed inset-y-0 left-0 z-20 hidden w-[242px] flex-col overflow-y-auto border-r border-border bg-surface px-5 py-8 lg:flex"
          >
            <div className="px-2">
              <Brand />
            </div>
            <p className="mb-3 mt-12 px-3 text-[10px] font-semibold tracking-[.2em] text-muted-foreground">
              {t("CUỐN SỔ CỦA BẠN")}
            </p>
            <WorkspaceNavigation
              label={demo ? "Điều hướng bản demo" : undefined}
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
              {demo ? (
                <Button
                  asChild
                  variant="ghost"
                  className="w-full justify-start px-3 text-muted-foreground"
                >
                  <Link href="/login">
                    <LogIn />
                    {t("Đăng nhập")}
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={logout}
                  disabled={busy}
                  variant="ghost"
                  className="w-full justify-start px-3 text-muted-foreground"
                >
                  <LogOut />
                  {busy ? t("Đang đăng xuất…") : t("Đăng xuất")}
                </Button>
              )}
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {t(error)}
                </p>
              )}
            </div>
          </aside>
        )}
        <div className={embedded ? undefined : "lg:ml-[242px]"}>
          {embedded && !androidWorkspace ? (
            (legacyAndroidChrome ||
              !nativeChrome ||
              path === "/app/settings") && (
              <header
                className={cn(
                  "relative flex items-center gap-3",
                  legacyAndroidChrome
                    ? "justify-between border-b border-border bg-surface px-3"
                    : "justify-end px-5 pt-3 sm:px-9",
                )}
              >
                {legacyAndroidChrome && <Brand compact />}
                {path === "/app/settings" && <LanguageSwitcher />}
                {!nativeChrome && <AppearancePicker key={path} />}
              </header>
            )
          ) : (
            <header
              data-slot="workspace-header"
              onClickCapture={
                androidWorkspace
                  ? (event) => {
                      if (
                        event.target instanceof Element &&
                        event.target.closest("a[href]") &&
                        !canLeaveAndroidPage()
                      ) {
                        event.preventDefault();
                      }
                    }
                  : undefined
              }
              className={
                androidWorkspace
                  ? "android-workspace-header"
                  : "relative flex h-[82px] items-center justify-between border-b border-border bg-surface/80 px-4 sm:px-9"
              }
            >
              <div className={androidWorkspace ? "min-w-0" : "lg:hidden"}>
                <Brand compact />
              </div>
              {!androidWorkspace && (
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
              )}
              <div
                className={
                  androidWorkspace
                    ? "android-workspace-header-actions"
                    : "ml-auto flex items-center gap-2 sm:gap-3"
                }
              >
                <LanguageSwitcher
                  compact
                  canLeave={androidWorkspace ? canLeaveAndroidPage : undefined}
                />
                <AppearancePicker key={path} />
                {demo && (
                  <Button
                    asChild
                    variant="outline"
                    size="icon"
                    className={androidWorkspace ? undefined : "lg:hidden"}
                  >
                    <Link
                      href={
                        androidWorkspace ? "/login?mobileSignIn=1" : "/login"
                      }
                      aria-label={t("Đăng nhập")}
                    >
                      <LogIn />
                    </Link>
                  </Button>
                )}
                <Link
                  href="/app/settings"
                  aria-label={t("Cài đặt tài khoản")}
                  className="flex items-center gap-3"
                >
                  {!androidWorkspace && (
                    <span className="hidden text-xs sm:block">
                      {displayName}
                    </span>
                  )}
                  <span className="flex size-9 items-center justify-center rounded-full border border-border bg-accent-soft text-sm font-bold text-primary">
                    {displayName[0]?.toUpperCase()}
                  </span>
                </Link>
              </div>
            </header>
          )}
          {process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" &&
            !demo && (
              <div className="bg-warning-soft px-5 py-1.5 text-center text-[11px] text-warning-foreground">
                {t("Firebase Emulator · Chỉ dùng dữ liệu giả")}
              </div>
            )}
          {embedded && demo && !androidWorkspace && (
            <div
              data-slot="demo-toolbar"
              className="flex items-center justify-between gap-2 border-b border-border px-3 py-1"
            >
              <span className="text-xs font-semibold">
                {t("Sổ dạy học mẫu")}
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">
                  <LogIn />
                  {t("Đăng nhập")}
                </Link>
              </Button>
            </div>
          )}
          <main
            id="main"
            data-slot="workspace-main"
            tabIndex={-1}
            className={cn(
              // Keep the final row above bottom navigation in the app and the mobile browser.
              "mx-auto max-w-[1320px] px-5 pt-5 pb-[calc(7rem+var(--font-size-offset)+env(safe-area-inset-bottom,0px))] sm:px-9 sm:pt-9",
              !embedded && "lg:pb-9",
              nativeChrome && "pb-3!",
            )}
          >
            {children}
          </main>
        </div>
        {!embedded && (
          <WorkspaceNavigation
            mobile
            label={demo ? "Điều hướng bản demo" : "Điều hướng chính"}
            links={workspaceTabs}
            currentHref={path}
            isActive={activeLink}
          />
        )}
      </div>
    </AppearanceContext.Provider>
  );
}
