"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deletionLabels, type DeletionStatus } from "@/domain/data";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export function DeletionProgress() {
  const { t } = useI18n();
  const [status, setStatus] = useState<DeletionStatus | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        let current = await api<DeletionStatus>("/api/account/deletion");
        if (!active) return;
        setError("");
        setStatus(current);
        while (active && current.phase !== "done") {
          if (current.busy) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (!active) return;
            current = await api<DeletionStatus>("/api/account/deletion");
          } else
            current = await api<DeletionStatus>("/api/account/deletion", {
              method: "POST",
              body: {},
            });
          if (active) setStatus(current);
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof TypeError || error instanceof SyntaxError
              ? t(
                  "Chưa nhận đủ phản hồi từ máy chủ. Trạng thái xóa đã được giữ để tiếp tục.",
                )
              : error instanceof Error
                ? error.message
                : t("Chưa xóa xong. Bạn thử tiếp tục nhé."),
          );
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [attempt, t]);
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <Link href="/" className="serif text-xl text-primary">
        {t("LessonBrook · Sổ buổi dạy & học phí")}
      </Link>
      <Card className="mt-8 space-y-5 p-6">
        <LanguageSwitcher />
        <h1 className="serif text-3xl">
          {status?.phase === "done"
            ? t("Đã xóa tài khoản")
            : t("Tiến trình xóa tài khoản")}
        </h1>
        {status?.phase === "done" ? (
          <>
            <p className="text-sm leading-6">
              {t(
                "Dữ liệu đang lưu trong ứng dụng, link chia sẻ và tài khoản đăng nhập đã được xóa. Các tệp bạn từng tải về do bạn tự giữ. Lần đăng nhập Google tiếp theo sẽ tạo một sổ mới.",
              )}
            </p>
            <Button asChild variant="outline">
              <Link href="/">{t("Về trang giới thiệu")}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm leading-6">
              {t(
                "Giữ trang này mở để hoàn tất. Nếu bị gián đoạn, bạn mở lại trang này hoặc đăng nhập Google để tiếp tục yêu cầu đã xác nhận.",
              )}
            </p>
            {status && (
              <p role="status" className="text-sm text-primary">
                {t(deletionLabels[status.phase])}
                {status.busy ? t(" · Đang xử lý…") : "…"}
              </p>
            )}
            {!status && !error && (
              <p role="status" className="text-sm">
                {t("Đang kiểm tra yêu cầu…")}
              </p>
            )}
            {error && (
              <div role="alert" className="space-y-4 text-sm text-destructive">
                <p>{t(error)}</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    {t("Tiếp tục xóa")}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/login">{t("Đăng nhập Google")}</Link>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
