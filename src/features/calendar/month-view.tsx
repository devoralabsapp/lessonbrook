"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import Link from "@/components/workspace-link";
import { Button } from "@/components/ui/button";
import { statusLabels, vietnamToday } from "@/domain";
import type { TeachingClass } from "@/domain/classes";
import type { SessionWithPayment } from "@/domain/list-filters";
import {
  classCalendarEntries,
  lessonCalendarEntries,
  monthBounds,
  monthCells,
  shiftMonth,
  type CalendarEntry,
} from "@/domain/month-calendar";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";

type RecordPage<T> = { items: T[]; nextCursor: string | null };
function useCalendarRecords<T extends { id: string }>(
  endpoint: string,
  revision: number,
) {
  const [attempt, setAttempt] = useState(0);
  const key = `${endpoint}:${revision}:${attempt}`;
  const [result, setResult] = useState<{ key: string; items: T[] } | null>(
    null,
  );
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const items = new Map<string, T>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("limit", "50");
        if (cursor) url.searchParams.set("cursor", cursor);
        const page = await api<RecordPage<T>>(`${url.pathname}${url.search}`);
        if (!active) return;
        for (const item of page.items) items.set(item.id, item);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new Error("Chưa tải được lịch. Vui lòng thử lại.");
        if (cursor) cursors.add(cursor);
        // Filtered scan pages can be empty and still have a cursor.
      } while (cursor);
      if (active) setResult({ key, items: [...items.values()] });
    }
    void load().catch((error: unknown) => {
      if (active)
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "Chưa tải được lịch. Vui lòng thử lại.",
        });
    });
    return () => {
      active = false;
    };
  }, [endpoint, key]);
  return {
    items: result?.key === key ? result.items : null,
    error: failure?.key === key ? failure.message : "",
    retry: () => setAttempt((value) => value + 1),
  };
}

function entryTone(entry: CalendarEntry) {
  return entry.statuses.includes("cancelled")
    ? "pink"
    : entry.statuses.includes("planned")
      ? "yellow"
      : entry.statuses.length
        ? "mint"
        : "blue";
}

export function WorkspaceMonthCalendar({
  kind,
  endpoint,
  revision = 0,
}: {
  kind: "classes" | "lessons";
  endpoint: string;
  revision?: number;
}) {
  const { t, locale } = useI18n();
  const today = vietnamToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selection, setSelection] = useState(today);
  const bounds = monthBounds(month);
  const query = new URLSearchParams(endpoint.split("?")[1]);
  if (kind === "lessons") {
    query.set("from", bounds.from);
    query.set("to", bounds.to);
  }
  const records = useCalendarRecords<TeachingClass | SessionWithPayment>(
    `${endpoint.split("?")[0]}?${query}`,
    revision,
  );
  const entries = useMemo(
    () =>
      !records.items
        ? []
        : kind === "classes"
          ? classCalendarEntries(records.items as TeachingClass[], month)
          : lessonCalendarEntries(records.items as SessionWithPayment[]),
    [records.items, kind, month],
  );
  const selectedDate = selection.startsWith(month) ? selection : bounds.from;
  const selected = entries.filter((entry) => entry.date === selectedDate);
  const dateFormat = new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : "vi-VN",
    { dateStyle: "full", timeZone: "UTC" },
  );
  const monthTitle = new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : "vi-VN",
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(`${bounds.from}T00:00:00Z`));
  function move(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelection(`${next}-01`);
  }
  return (
    <section aria-label={t("Lịch tháng")} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
        <h3 aria-live="polite" className="text-lg font-bold capitalize">
          {monthTitle}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label={t("Tháng trước")}
            disabled={month <= "1900-01"}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelection(today);
            }}
          >
            {t("Tháng này")}
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("Tháng sau")}
            disabled={month >= "2100-12"}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="w-full text-xs leading-5 text-muted-foreground">
          {kind === "classes"
            ? t(
                "Thời khóa biểu lặp hằng tuần, không phải xác nhận buổi đã dạy. Lớp chưa có lịch vẫn nằm trong Danh sách.",
              )
            : t(
                "Các buổi đã ghi nhận trong tháng theo bộ lọc. Buổi nhóm/lớp được gộp thành một mục; số học viên theo bộ lọc.",
              )}
        </p>
        {kind === "lessons" && (
          <div
            aria-label={t("Trạng thái buổi")}
            className="flex flex-wrap gap-2"
          >
            {(["planned", "completed", "cancelled"] as const).map((status) => (
              <span key={status} className={`status status-${status}`}>
                {t(statusLabels[status])}
              </span>
            ))}
          </div>
        )}
      </div>
      {records.error ? (
        <div role="alert" className="p-6">
          <p className="mb-3 text-sm text-destructive">{t(records.error)}</p>
          <Button variant="outline" onClick={records.retry}>
            {t("Thử lại")}
          </Button>
        </div>
      ) : !records.items ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 p-10 text-sm"
        >
          <LoaderCircle className="size-4 animate-spin" />
          {t("Đang tải lịch…")}
        </p>
      ) : (
        <>
          <p
            role="status"
            className="px-4 py-3 text-xs text-muted-foreground sm:px-6"
          >
            {t("{0} mục trong tháng · Chọn một ngày để xem chi tiết.", {
              "0": entries.length,
            })}
          </p>
          <div
            className="month-calendar grid grid-cols-7 border-t border-border"
            aria-label={monthTitle}
          >
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="min-w-0 border-b border-border bg-surface py-2 text-center text-xs font-bold"
              >
                {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, 5, 1 + index)))}
              </div>
            ))}
            {monthCells(month).map((date) => {
              const dayEntries = entries.filter((entry) => entry.date === date);
              const inMonth = date.startsWith(month);
              return (
                <button
                  type="button"
                  key={date}
                  data-date={date}
                  disabled={!inMonth}
                  aria-pressed={selectedDate === date}
                  aria-current={date === today ? "date" : undefined}
                  aria-label={`${dateFormat.format(new Date(`${date}T00:00:00Z`))} · ${t("{0} mục", { "0": dayEntries.length })}`}
                  onClick={() => setSelection(date)}
                  className={`calendar-day flex min-w-0 flex-col items-stretch justify-start border-b border-r border-border p-1.5 text-left align-top transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring sm:p-2 ${inMonth ? "hover:bg-muted" : "bg-muted/40 text-muted-foreground"} ${selectedDate === date ? "bg-accent-soft ring-2 ring-inset ring-primary" : ""}`}
                >
                  <span
                    className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-bold ${date === today ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {!!dayEntries.length && (
                    <>
                      <span className="mt-1 block text-center text-xs font-bold sm:hidden">
                        {dayEntries.length}
                        <span className="sr-only"> {t("mục")}</span>
                      </span>
                      <span className="mt-1 hidden space-y-1 sm:block">
                        {dayEntries.slice(0, 2).map((entry) => (
                          <span
                            key={entry.id}
                            data-calendar-tone={entryTone(entry)}
                            className="block truncate rounded-md border border-border bg-surface px-1 py-0.5 text-xs"
                          >
                            <span className="font-bold">
                              {entry.time ?? "—"}
                            </span>{" "}
                            {entry.title ?? t("Buổi nhóm tự chọn")}
                          </span>
                        ))}
                        {dayEntries.length > 2 && (
                          <span className="block text-xs font-semibold">
                            +{dayEntries.length - 2}
                          </span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-1 flex justify-center gap-1 sm:hidden"
                      >
                        {[...new Set(dayEntries.map(entryTone))].map((tone) => (
                          <span
                            key={tone}
                            data-calendar-tone={tone}
                            className="size-1.5 rounded-full border border-foreground"
                          />
                        ))}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div
            className="border-t border-border"
            aria-label={t("Chi tiết ngày đã chọn")}
          >
            <h4 className="bg-surface px-4 py-3 text-sm font-bold capitalize sm:px-6">
              {dateFormat.format(new Date(`${selectedDate}T00:00:00Z`))}
            </h4>
            {selected.length ? (
              <div className="divide-y divide-border">
                {selected.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    data-list-tone={entryTone(entry)}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted sm:px-6"
                  >
                    <time className="w-14 shrink-0 text-sm font-bold tabular-nums">
                      {entry.time ?? "—"}
                    </time>
                    <div className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-bold">
                        {entry.title ?? t("Buổi nhóm tự chọn")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("{0} học viên", { "0": entry.participants })}
                      </span>
                    </div>
                    <span className="flex flex-wrap gap-1">
                      {entry.statuses.map((status) => (
                        <span
                          key={status}
                          className={`status status-${status}`}
                        >
                          {t(statusLabels[status])}
                        </span>
                      ))}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {t("Không có lịch trong ngày này.")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
