"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import Link from "@/components/workspace-link";
import { formatVnd, vietnamToday } from "@/domain";
import { type Statement, statementDisplayStatus } from "@/domain/statements";
import { statementFilterLabels } from "@/domain/list-filters";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemedSelect } from "@/components/ui/themed-select";
import { type Page, StudentPicker, formatDate } from "./shared";
export function StatementsList({
  initialStudentId = "",
  initialStatus = "all",
}: {
  initialStudentId?: string;
  initialStatus?: string;
}) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState(initialStatus);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    key: string;
    page: Page<Statement>;
  } | null>(null);
  const [error, setError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const params = new URLSearchParams({ status });
  if (studentId) params.set("studentId", studentId);
  const endpoint = `/api/statements?${params}`;
  const key = `${endpoint}:${revision}`;
  useEffect(() => {
    let active = true;
    api<Page<Statement>>(endpoint)
      .then((page) => {
        if (active) setData({ key, page });
      })
      .catch((error) => {
        if (active) setError({ key, message: error.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  const page = data?.key === key ? data.page : null;
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Statement>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (item) =>
                      !current.page.items.some((old) => old.id === item.id),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
    } catch (error) {
      setError({
        key,
        message:
          error instanceof Error ? error.message : t("Chưa tải được bảng kê."),
      });
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("SỔ BUỔI DẠY & HỌC PHÍ")}
          </p>
          <h1 className="serif text-3xl sm:text-4xl">{t("Bảng kê học phí")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("Đối chiếu từng buổi và chốt số tiền cần thu.")}
          </p>
        </div>
        <Button asChild>
          <Link
            href={`/app/statements/new${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`}
          >
            {t("Lập bảng kê")}
          </Link>
        </Button>
      </div>
      <Card className="grid items-start gap-5 p-5 sm:grid-cols-2">
        <StudentPicker value={studentId} onChange={setStudentId} optional />
        <label className="field-label">
          {t("Trạng thái bảng kê")}
          <ThemedSelect
            label={t("Trạng thái bảng kê")}
            value={status}
            onChange={setStatus}
            options={Object.entries(statementFilterLabels).map(
              ([value, label]) => ({
                value,
                label: t(label),
              }),
            )}
          />
        </label>
      </Card>
      {error?.key === key ? (
        <Card role="alert" className="p-6 text-sm">
          <p className="mb-3 text-destructive">{t(error.message)}</p>
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("Thử lại")}
          </Button>
        </Card>
      ) : !page ? (
        <Card role="status" className="p-8 text-sm">
          {t("Đang tải bảng kê…")}
        </Card>
      ) : !page.items.length ? (
        <Card className="p-8 text-center">
          <h2 className="serif text-2xl">
            {page.nextCursor
              ? t("Chưa thấy bảng kê phù hợp.")
              : t("Chưa có bảng kê trong danh sách này.")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {page.nextCursor
              ? t("Bạn có thể tải tiếp danh sách để tìm thêm kết quả.")
              : t(
                  "Lập nháp từ các buổi hoàn thành có tính phí. Bản nháp chưa được tính vào khoản phải thu.",
                )}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {page.items.map((statement) => {
            const display = statementDisplayStatus(statement, vietnamToday());
            const tone =
              statement.status === "draft"
                ? "blue"
                : statement.status === "void"
                  ? "neutral"
                  : statement.paidVnd >= statement.totalVnd
                    ? "mint"
                    : display.overdue || statement.paidVnd === 0
                      ? "pink"
                      : "yellow";
            return (
              <Card key={statement.id} data-list-tone={tone} className="p-5">
                <Link
                  className="block space-y-3"
                  href={`/app/statements/${statement.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="break-words text-sm">
                      {statement.number ?? t("Bản nháp")} ·{" "}
                      {statement.recipientSnapshot.displayName}
                    </strong>
                    <span
                      data-slot="list-status"
                      className="rounded-full bg-muted px-3 py-1 text-xs"
                    >
                      {t(display.label)}
                      {display.overdue ? t(" · Quá hạn") : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(statement.periodStart, locale)} –{" "}
                    {formatDate(statement.periodEnd, locale)} ·{" "}
                    {statement.items.length} {t("buổi")}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {t("Đến hạn ")}
                      {formatDate(statement.dueDate, locale)}
                    </span>
                    <strong className="text-base">
                      {formatVnd(statement.totalVnd, locale)}
                    </strong>
                  </div>
                  {statement.status === "issued" && (
                    <p className="text-xs">
                      {t("Còn phải thu:")}{" "}
                      {formatVnd(
                        statement.totalVnd - statement.paidVnd,
                        locale,
                      )}
                    </p>
                  )}
                </Link>
              </Card>
            );
          })}
        </div>
      )}
      {page?.nextCursor && (
        <Button variant="outline" disabled={moreBusy} onClick={more}>
          {moreBusy ? t("Đang tải…") : t("Tải thêm bảng kê")}
        </Button>
      )}
    </div>
  );
}
