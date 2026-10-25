"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  Sprout,
  Users,
  School,
} from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useAppearancePreview } from "@/lib/use-appearance-preview";
import { AppearanceContext } from "./appearance";
import { DEFAULT_THEME, type Theme } from "@/domain/appearance";
const links = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/app/students", label: "Học viên", icon: Users },
  { href: "/app/classes", label: "Lớp học", icon: School },
  { href: "/app/sessions", label: "Buổi dạy", icon: CalendarDays },
  { href: "/app/statements", label: "Bảng kê", icon: ReceiptText },
];
export function AppShell({
  name,
  initialTheme = DEFAULT_THEME,
  children,
}: {
  name: string;
  initialTheme?: Theme;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const appearance = useAppearancePreview(initialTheme, path);
  const activeLink = (href: string) =>
    href === "/app"
      ? path === href
      : path.startsWith(href) ||
        (href === "/app/sessions" && path.startsWith("/app/lessons"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      window.location.assign("/login");
    } catch {
      setError("Chưa thể đăng xuất. Vui lòng thử lại.");
      setBusy(false);
    }
  }
  return (
    <AppearanceContext.Provider value={appearance}>
      <div
        data-theme={appearance.theme}
        className="min-h-dvh bg-background text-foreground"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-3"
        >
          Đến nội dung
        </a>
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-[242px] flex-col border-r border-border bg-surface px-5 py-8 lg:flex">
          <div className="px-2">
            <Brand />
          </div>
          <p className="mb-3 mt-12 px-3 text-[10px] font-semibold tracking-[.2em] text-muted-foreground">
            CUỐN SỔ CỦA BẠN
          </p>
          <nav className="space-y-1.5">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={activeLink(href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm",
                  activeLink(href)
                    ? "bg-accent-soft font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon size={18} />
                {label}
                {path === href && (
                  <ChevronRight size={14} className="ml-auto" />
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="mb-6 rounded-2xl bg-accent-soft p-4">
              <Sprout size={23} className="mb-3 text-primary" />
              <p className="serif text-lg">Ghi một chút mỗi ngày.</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Để cuối tháng, mọi buổi dạy đều có trong sổ.
              </p>
            </div>
            <Link
              href="/app/settings"
              className="flex items-center gap-3 rounded-xl p-3 text-sm text-muted-foreground"
            >
              <Settings size={18} />
              Cài đặt tài khoản
            </Link>
            <Button
              onClick={logout}
              disabled={busy}
              variant="ghost"
              className="w-full justify-start px-3 text-muted-foreground"
            >
              <LogOut />
              {busy ? "Đang đăng xuất…" : "Đăng xuất"}
            </Button>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </aside>
        <div className="lg:ml-[242px]">
          <header className="flex h-[82px] items-center justify-between border-b border-border bg-surface/80 px-5 sm:px-9">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <p className="hidden text-xs text-muted-foreground lg:block">
              Không gian dạy học{" "}
              <span className="mx-2 text-muted-foreground">/</span>{" "}
              <span className="text-foreground">
                {path.includes("students")
                  ? "Học viên"
                  : path.includes("classes")
                    ? "Lớp học"
                    : path.includes("sessions") || path.includes("lessons")
                      ? "Buổi dạy"
                      : path.includes("statements")
                        ? "Bảng kê"
                        : path.includes("settings")
                          ? "Cài đặt"
                          : path === "/onboarding"
                            ? "Bắt đầu"
                            : "Tổng quan"}
              </span>
            </p>
            <Link
              href="/app/settings"
              aria-label="Cài đặt tài khoản"
              className="flex items-center gap-3"
            >
              <span className="hidden text-xs sm:block">{name}</span>
              <span className="flex size-9 items-center justify-center rounded-full border border-border bg-accent-soft text-sm font-bold text-primary">
                {name[0]?.toUpperCase()}
              </span>
            </Link>
          </header>
          {process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" && (
            <div className="bg-warning-soft px-5 py-1.5 text-center text-[11px] text-warning-foreground">
              Firebase Emulator · Chỉ dùng dữ liệu giả
            </div>
          )}
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto max-w-[1320px] p-5 pb-28 sm:p-9 sm:pb-28 lg:pb-9"
          >
            {children}
          </main>
        </div>
        <nav
          aria-label="Điều hướng chính"
          className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={activeLink(href) ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-[10px]",
                activeLink(href)
                  ? "font-bold text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </AppearanceContext.Provider>
  );
}
