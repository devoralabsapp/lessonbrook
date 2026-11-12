"use client";

import Link from "@/components/workspace-link";
import {
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  ReceiptText,
  School,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export const workspaceTabs = [
  { id: "dashboard", href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { id: "students", href: "/app/students", label: "Học viên", icon: Users },
  { id: "classes", href: "/app/classes", label: "Lớp học", icon: School },
  {
    id: "lessons",
    href: "/app/sessions",
    label: "Buổi dạy",
    icon: CalendarDays,
  },
  {
    id: "statements",
    href: "/app/statements",
    label: "Bảng kê",
    icon: ReceiptText,
  },
] as const;

export function WorkspaceNavigation({
  links,
  currentHref,
  isActive,
  mobile = false,
  label,
}: {
  links: readonly { href: string; label: string; icon: LucideIcon }[];
  currentHref: string;
  isActive: (href: string) => boolean;
  mobile?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={label ? t(label) : undefined}
      data-position={mobile ? "bottom" : "sidebar"}
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          : "space-y-1.5"
      }
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              mobile
                ? "flex min-w-0 flex-1 flex-col items-center gap-1 py-3 text-[10px]"
                : "flex items-center gap-3 rounded-xl px-3 py-3 text-sm",
              active
                ? cn(
                    "text-primary",
                    mobile ? "font-bold" : "bg-accent-soft font-semibold",
                  )
                : cn("text-muted-foreground", !mobile && "hover:bg-muted"),
            )}
          >
            <Icon size={mobile ? 20 : 18} aria-hidden="true" />
            {t(label)}
            {!mobile && href === currentHref && (
              <ChevronRight size={14} className="ml-auto" aria-hidden="true" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
