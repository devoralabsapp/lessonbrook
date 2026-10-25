import { NotebookPen } from "lucide-react";
import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/app"
      data-slot="brand"
      className={
        compact
          ? "inline-flex min-h-11 items-center gap-2"
          : "inline-flex items-center gap-3"
      }
      aria-label="LessonBrook — trang tổng quan"
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
              ? "block text-base font-bold tracking-tight"
              : "block text-lg font-bold tracking-tight"
          }
        >
          LessonBrook<span className="text-[#acb77f]">.</span>
        </span>
        {!compact && (
          <span className="block text-[10px] tracking-wide text-muted-foreground">
            SỔ BUỔI DẠY & HỌC PHÍ
          </span>
        )}
      </span>
    </Link>
  );
}
