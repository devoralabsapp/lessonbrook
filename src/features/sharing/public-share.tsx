"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  publicStatementSchema,
  shareTokenSchema,
  type PublicStatement,
} from "@/domain/sharing";
import { Button } from "@/components/ui/button";
import { PublicStatementView } from "./public-statement";
const subscribe = (change: () => void) => {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
};
export function PublicShare() {
  const { t } = useI18n();
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  const [revision, setRevision] = useState(0);
  const key = `${hash}:${revision}`;
  const [data, setData] = useState<{
    key: string;
    statement: PublicStatement | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!shareTokenSchema.safeParse(hash).success)
        return { statement: null, failed: false };
      const response = await fetch("/api/share/resolve", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: hash }),
      });
      if (!response.ok)
        return { statement: null, failed: response.status !== 404 };
      return {
        statement: publicStatementSchema.parse(await response.json()),
        failed: false,
      };
    };
    load()
      .then((result) => {
        if (active) setData({ key, ...result });
      })
      .catch(() => {
        if (active) setData({ key, statement: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [hash, key, t]);
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:py-12">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <p className="serif text-xl text-primary">
        LessonBrook{" "}
        <span className="font-sans text-xs text-muted-foreground">
          {t("· Sổ buổi dạy & học phí")}
        </span>
      </p>
      {data?.key !== key ? (
        <p
          role="status"
          className="rounded-2xl border border-border bg-white p-8 text-sm"
        >
          {t("Đang mở bảng kê…")}
        </p>
      ) : data.statement ? (
        <>
          <PublicStatementView statement={data.statement} />
          <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
            {t("Cập nhật số liệu")}
          </Button>
        </>
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-white p-6">
          <h1 className="serif text-2xl">
            {data.failed
              ? t("Chưa tải được bảng kê")
              : t("Bảng kê không khả dụng")}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {data.failed
              ? t("Bạn thử lại sau ít phút hoặc liên hệ giáo viên nhé.")
              : t(
                  "Link có thể đã hết hạn, được thu hồi hoặc không còn sử dụng. Bạn liên hệ giáo viên để nhận link mới nhé.",
                )}
          </p>
          <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
            {t("Thử lại")}
          </Button>
        </section>
      )}
      <noscript>{t("Bật JavaScript để mở bảng kê học phí.")}</noscript>
    </main>
  );
}
