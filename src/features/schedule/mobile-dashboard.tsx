"use client";

import { useEffect } from "react";
import Link from "@/components/workspace-link";
import { Card } from "@/components/ui/card";
import { formatVnd } from "@/domain";
import {
  sortUpcomingLessons,
  type UpcomingSchedule,
} from "@/domain/upcoming-schedule";
import { LoadError, useResource } from "@/features/classes/shared";
import { useI18n } from "@/lib/i18n/client";
import { UpcomingLessonRows } from "./upcoming";

export function MobileDashboard() {
  const { t, locale } = useI18n();
  const summaryRequest = useResource<{
    outstandingVnd: number;
    unbilledVnd: number;
    receivedMonthVnd: number;
    activeStudents: number;
  }>("/api/summary", true);
  const scheduleRequest = useResource<UpcomingSchedule>(
    "/api/mobile/schedule",
    true,
  );
  const summary = summaryRequest.data;
  const schedule = scheduleRequest.data;
  const reloadSummary = summaryRequest.reload;
  const reloadSchedule = scheduleRequest.reload;
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      reloadSummary();
      reloadSchedule();
    }
    window.addEventListener("class-lessons-created", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("class-lessons-created", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [reloadSummary, reloadSchedule]);
  const lessons = schedule
    ? sortUpcomingLessons([
        ...schedule.items,
        ...(schedule.recurring ?? []),
      ]).slice(0, 8)
    : [];
  const money = (amount: number | undefined) =>
    amount === undefined ? "…" : formatVnd(amount, locale);

  if (summaryRequest.error && !summary)
    return (
      <LoadError message={summaryRequest.error} retry={summaryRequest.reload} />
    );

  return (
    <div className="fade-in space-y-4">
      <h1 className="serif text-3xl">{t("Một ngày dạy học thật tốt.")}</h1>
      <Card className="p-5" data-tone="yellow">
        <p className="text-sm font-semibold">{t("Học phí chưa thu")}</p>
        <p className="mt-2 text-3xl font-bold">
          {money(summary?.outstandingVnd)}
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card className="min-w-0 p-5" data-tone="blue">
          <p className="text-xs">{t("Buổi chưa lập bảng kê")}</p>
          <p className="mt-2 break-words font-bold">
            {money(summary?.unbilledVnd)}
          </p>
        </Card>
        <Card className="min-w-0 p-5" data-tone="mint">
          <p className="text-xs">{t("Đã thu trong tháng")}</p>
          <p className="mt-2 break-words font-bold">
            {money(summary?.receivedMonthVnd)}
          </p>
        </Card>
      </div>
      <Card className="p-5">
        <p className="text-sm">{t("Học viên đang học")}</p>
        <p className="mt-2 text-xl font-bold">
          {summary?.activeStudents ?? "…"}
        </p>
      </Card>
      <Card data-testid="upcoming-lesson-list">
        <h2 className="serif border-b border-border px-5 py-4 text-xl font-bold">
          {t("Lịch dạy sắp tới")}
        </h2>
        {scheduleRequest.error && !schedule ? (
          <div className="p-4">
            <LoadError
              message={scheduleRequest.error}
              retry={scheduleRequest.reload}
            />
          </div>
        ) : lessons.length ? (
          <>
            <UpcomingLessonRows items={lessons} today={schedule?.today ?? ""} />
            <Link
              href="/app/schedule"
              className="block border-t border-border p-4 text-sm font-semibold text-primary underline"
            >
              {t("Xem lịch đầy đủ")}
            </Link>
          </>
        ) : (
          <p className="p-4 text-sm">
            {schedule ? t("Không có buổi dự kiến trong lịch.") : t("Đang tải…")}
          </p>
        )}
      </Card>
    </div>
  );
}
