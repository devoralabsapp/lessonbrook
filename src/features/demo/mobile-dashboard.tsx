"use client";

import { CalendarDays } from "lucide-react";
import Link from "@/components/workspace-link";
import { Card } from "@/components/ui/card";
import { formatVnd } from "@/domain";
import {
  sortUpcomingLessons,
  upcomingLessonPath,
  type UpcomingSchedule,
} from "@/domain/upcoming-schedule";
import { LoadError, useResource } from "@/features/classes/shared";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";

const tones = ["blue", "mint", "yellow"] as const;

export function MobileDemoDashboard() {
  const { t, locale } = useI18n();
  const summaryRequest = useResource<{
    outstandingVnd: number;
    unbilledVnd: number;
    receivedMonthVnd: number;
    activeStudents: number;
  }>("/api/summary");
  const scheduleRequest = useResource<UpcomingSchedule>("/api/mobile/schedule");
  const summary = summaryRequest.data;
  const schedule = scheduleRequest.data;
  const lessons = schedule
    ? sortUpcomingLessons([
        ...schedule.items,
        ...(schedule.recurring ?? []),
      ]).slice(0, 8)
    : [];
  const money = (amount: number | undefined) =>
    amount === undefined ? "…" : formatVnd(amount, locale);

  if (summaryRequest.error)
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
      <section className="space-y-3">
        <h2 className="serif text-xl font-bold">{t("Lịch dạy sắp tới")}</h2>
        {scheduleRequest.error ? (
          <LoadError
            message={scheduleRequest.error}
            retry={scheduleRequest.reload}
          />
        ) : lessons.length ? (
          <>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {lessons.map((lesson, index) => (
                  <li
                    key={upcomingLessonPath(lesson)}
                    data-calendar-tone={tones[index % tones.length]}
                  >
                    <Link
                      href={upcomingLessonPath(lesson)}
                      className="flex items-center gap-3 p-3"
                    >
                      <CalendarDays className="size-5 shrink-0" aria-hidden />
                      <div className="min-w-0 break-words">
                        <p className="text-sm font-semibold">
                          {lesson.name ?? t("Buổi nhóm tự chọn")}
                        </p>
                        <p className="text-xs">
                          {formatDate(lesson.date, locale)} ·{" "}
                          {lesson.time ?? t("Chưa đặt giờ")}
                          {lesson.kind === "recurring"
                            ? ` · ${t("Hằng tuần")}`
                            : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Link
              href="/app/schedule"
              className="text-sm font-semibold text-primary underline"
            >
              {t("Xem lịch đầy đủ")}
            </Link>
          </>
        ) : (
          <p className="text-sm">
            {schedule ? t("Không có buổi dự kiến trong lịch.") : t("Đang tải…")}
          </p>
        )}
      </section>
    </div>
  );
}
