"use client";

import Link from "next/link";
import {
  upcomingLessonPath,
  type UpcomingSchedule,
} from "@/domain/upcoming-schedule";
import { LoadError, useResource } from "@/features/classes/shared";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";
import { Card } from "@/components/ui/card";

export function UpcomingScheduleView() {
  const { t, locale } = useI18n();
  const schedule = useResource<UpcomingSchedule>("/api/mobile/schedule");
  if (schedule.error)
    return <LoadError message={schedule.error} retry={schedule.reload} />;
  if (!schedule.data) return <p role="status">{t("Đang tải…")}</p>;
  const { today, through, items } = schedule.data;
  return (
    <div className="space-y-4">
      <h1 className="serif text-3xl">{t("Lịch dạy sắp tới")}</h1>
      <p className="text-sm text-muted-foreground">
        {formatDate(today, locale)} – {formatDate(through, locale)}
      </p>
      {items.length ? (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((lesson) => (
              <li key={`${lesson.kind}:${lesson.id}`}>
                <Link
                  href={upcomingLessonPath(lesson)}
                  className="block rounded-lg p-3 hover:bg-muted"
                >
                  <span className="block font-medium">
                    {lesson.name ?? t("Buổi nhóm tự chọn")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(lesson.date, locale)} ·{" "}
                    {lesson.time ?? t("Chưa đặt giờ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p>{t("Không có buổi dự kiến trong lịch.")}</p>
      )}
    </div>
  );
}
