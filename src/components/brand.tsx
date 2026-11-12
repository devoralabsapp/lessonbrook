"use client";
import { useI18n } from "@/lib/i18n/client";

import { NotebookPen } from "lucide-react";
import Link from "@/components/workspace-link";
export function Brand({
  compact = false,
  href = "/app",
}: {
  compact?: boolean;
  href?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      data-slot="brand"
      className={
        compact
          ? "inline-flex min-h-11 items-center gap-1.5 min-[380px]:gap-2"
          : "inline-flex items-center gap-3"
      }
      aria-label={t("LessonBrook — trang tổng quan")}
    >
      <span
        className={
          compact
            ? "flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            : "flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        }
      >
        <NotebookPen size={compact ? 18 : 22} />
      </span>
      <span>
        <span
          className={
            compact
              ? "block text-sm font-bold tracking-tight min-[380px]:text-base"
              : "block text-lg font-bold tracking-tight"
          }
        >
          LessonBrook<span className="text-[#acb77f]">.</span>
        </span>
        {!compact && (
          <span className="block text-[10px] tracking-wide text-muted-foreground">
            {t("SỔ BUỔI DẠY & HỌC PHÍ")}
          </span>
        )}
      </span>
    </Link>
  );
}
