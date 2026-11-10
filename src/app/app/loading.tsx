"use client";
import { useI18n } from "@/lib/i18n/client";

export default function Loading() {
  const { t } = useI18n();
  return (
    <p
      role="status"
      className="animate-pulse p-6 text-sm text-muted-foreground"
    >
      {t("Đang mở sổ…")}
    </p>
  );
}
