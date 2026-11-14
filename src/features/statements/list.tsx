"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import Link from "@/components/workspace-link";
import {
  RecordViewSwitch,
  type RecordView,
} from "@/components/record-view-switch";
import { RecordNote } from "@/components/record-note";
import { formatVnd, vietnamToday } from "@/domain";
import {
  type Statement,
  periodBounds,
  statementDisplayStatus,
  statementIsPaid,
} from "@/domain/statements";
import {
  statementDateRangeSchema,
  statementFilterLabels,
  statementListDate,
} from "@/domain/list-filters";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { type Page, StudentPicker, formatDate } from "./shared";

const dateFilters = [
  { value: "all", label: "Mọi thời điểm" },
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
  { value: "custom", label: "Tùy chỉnh" },
] as const;

export function StatementsList({
  initialStudentId = "",
  initialStatus = "all",
}: {
  initialStudentId?: string;
  initialStatus?: string;
}) {
  const { t, locale } = useI18n();
  const [recordView, setRecordView] = useState<RecordView>("notes");
  const showNotes = recordView === "notes";
  const [status, setStatus] = useState(initialStatus);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [period, setPeriod] = useState<(typeof dateFilters)[number]["value"]>(
    initialStudentId || initialStatus !== "all" ? "all" : "month",
  );
  const [custom, setCustom] = useState({ from: "", to: "" });
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
  const today = vietnamToday();
  const bounds =
    period === "week" || period === "month"
      ? periodBounds(period, today)
      : null;
  const from =
    period === "custom"
      ? custom.from
      : period === "today"
        ? today
        : bounds?.start;
  const to =
    period === "custom" ? custom.to : period === "today" ? today : bounds?.end;
  const range = statementDateRangeSchema.safeParse({
    from: from || undefined,
    to: to || undefined,
  });
  const params = new URLSearchParams({ status });
  if (studentId) params.set("studentId", studentId);
  if (range.success && from) params.set("from", from);
  if (range.success && to) params.set("to", to);
  const endpoint = range.success ? `/api/statements?${params}` : "";
  const key = `${endpoint}:${revision}`;
  useEffect(() => {
    if (!endpoint) return;
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
      <div
        data-slot="page-heading"
        className="flex flex-wrap items-start justify-between gap-4"
      >
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
      <Card
        data-layout="statement-filters"
        className="grid items-start gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
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
        <label className="field-label min-w-0">
          {t("Ngày bảng kê")}
          <ThemedSelect
            label={t("Ngày bảng kê")}
            value={period}
            onChange={setPeriod}
            options={dateFilters.map(({ value, label }) => ({
              value,
              label: t(label),
            }))}
          />
        </label>
        {period === "custom" && (
          <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="field-label min-w-0">
              {t("Từ ngày")}
              <Input
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={custom.from}
                aria-invalid={!range.success}
                onChange={(event) =>
                  setCustom({ ...custom, from: event.target.value })
                }
              />
            </label>
            <label className="field-label min-w-0">
              {t("Đến ngày")}
              <Input
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={custom.to}
                aria-invalid={!range.success}
                onChange={(event) =>
                  setCustom({ ...custom, to: event.target.value })
                }
              />
            </label>
            {!range.success && (
              <p
                role="alert"
                className="col-span-full text-sm text-destructive"
              >
                {t("Khoảng ngày không hợp lệ.")}
              </p>
            )}
          </div>
        )}
      </Card>
      <div className="flex justify-end">
        <RecordViewSwitch value={recordView} onChange={setRecordView} />
      </div>
      {!endpoint ? null : error?.key === key ? (
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
        <div
          className={
            showNotes
              ? "record-note-grid record-note-statements px-1"
              : "space-y-3"
          }
        >
          {page.items.map((statement) => {
            const display = statementDisplayStatus(statement, today);
            const paid = statementIsPaid(statement);
            const tone =
              statement.status === "draft"
                ? "blue"
                : statement.status === "void"
                  ? "neutral"
                  : paid
                    ? "mint"
                    : "pink";
            return (
              <RecordNote
                key={statement.id}
                recordId={statement.id}
                tone={tone}
                note={showNotes}
                card
                className={showNotes ? undefined : "p-5"}
              >
                <Link
                  className={
                    showNotes ? "grid gap-y-2 leading-5" : "block space-y-3"
                  }
                  href={`/app/statements/${statement.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <strong className="min-w-0 break-words text-sm">
                      {statement.number ?? t("Bản nháp")} ·{" "}
                      {statement.recipientSnapshot.displayName}
                    </strong>
                    {statement.status !== "issued" && (
                      <span
                        data-slot="list-status"
                        className="status whitespace-nowrap rounded-full bg-muted px-3"
                      >
                        {t(display.label)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(statement.periodStart, locale)} –{" "}
                    {formatDate(statement.periodEnd, locale)} ·{" "}
                    {statement.items.length} {t("buổi")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(statement.issueDate ? "Ngày phát hành:" : "Ngày tạo:")}{" "}
                    {formatDate(statementListDate(statement), locale)}
                  </p>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="text-xs text-muted-foreground">
                      {t("Đến hạn ")}
                      {formatDate(statement.dueDate, locale)}
                    </span>
                    <strong className="ml-auto whitespace-nowrap text-base">
                      {formatVnd(statement.totalVnd, locale)}
                    </strong>
                  </div>
                  {statement.status === "issued" && (
                    <div
                      className={
                        showNotes
                          ? "record-statement-payment"
                          : "flex flex-wrap items-center justify-between gap-2"
                      }
                    >
                      <p className="wrap-anywhere text-xs">
                        {t("Còn phải thu:")}{" "}
                        {formatVnd(
                          statement.totalVnd - statement.paidVnd,
                          locale,
                        )}
                      </p>
                      <span
                        data-slot="list-status"
                        className={`status ml-auto whitespace-nowrap rounded-full px-2.5 ${paid ? "status-paid" : "status-unpaid"}`}
                      >
                        {t(display.label)}
                        {display.overdue ? t(" · Quá hạn") : ""}
                      </span>
                    </div>
                  )}
                </Link>
              </RecordNote>
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
