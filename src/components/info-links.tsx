"use client";
import { useI18n } from "@/lib/i18n/client";

import Link from "next/link";
export function InfoLinks() {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("Hướng dẫn và dữ liệu")}
      className="flex flex-wrap gap-x-5 gap-y-3 text-xs leading-6 text-muted-foreground"
    >
      <Link className="underline underline-offset-4" href="/help">
        {t("Hướng dẫn & hỗ trợ")}
      </Link>
      <Link className="underline underline-offset-4" href="/privacy">
        {t("Dữ liệu & quyền riêng tư")}
      </Link>
      <Link className="underline underline-offset-4" href="/help#install">
        {t("Thêm vào màn hình chính")}
      </Link>
    </nav>
  );
}
