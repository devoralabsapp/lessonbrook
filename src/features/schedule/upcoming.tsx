"use client";

import Link from "@/components/workspace-link";
import { useEffect } from "react";
import {
  upcomingLessonPath,
  sortUpcomingLessons,
  type UpcomingSchedule,
} from "@/domain/upcoming-schedule";
import { LoadError, useResource } from "@/features/classes/shared";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";
import { Card } from "@/components/ui/card";

export function UpcomingScheduleView() {
  const { t, locale } = useI18n();
  const { data, error, reload } = useResource<UpcomingSchedule>(
    "/api/mobile/schedule",
  );
  useEffect(() => {
    window.addEventListener("class-lessons-created", reload);
    return () => window.removeEventListener("class-lessons-created", reload);
  }, [reload]);
  if (error) return <LoadError message={error} retry={reload} />;
  if (!data) return <p role="status">{t("Đang tải…")}</p>;
  const { today, through } = data;
  const items = sortUpcomingLessons([...data.items, ...(data.recurring ?? [])]);
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
              <li key={upcomingLessonPath(lesson)}>
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
                    {lesson.kind === "recurring" ? ` · ${t("Hằng tuần")}` : ""}
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
