"use client";
import { useI18n } from "@/lib/i18n/client";

import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card p-8">
      <h1 className="serif text-2xl">{t("Chưa thể mở sổ.")}</h1>
      <p className="my-4 text-sm text-muted-foreground">
        {t("Vui lòng kiểm tra kết nối và thử lại.")}
      </p>
      <Button onClick={reset}>{t("Thử lại")}</Button>
    </div>
  );
}
