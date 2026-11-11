"use client";

import type { GroupLesson, TeachingClass } from "@/domain/classes";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";
import { LoadError, usePaged } from "./shared";

export function LessonTargetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t, locale } = useI18n();
  const classes = usePaged<TeachingClass>("/api/classes?archived=all&limit=50");
  const groups = usePaged<GroupLesson>("/api/lessons?type=group&limit=50");
  const options = [
    {
      label: t("Lớp học"),
      items: classes.page?.items.map((item) => ({
        value: `class:${item.id}`,
        label: item.displayName + (item.archivedAt ? t(" · Đã lưu trữ") : ""),
      })),
      list: classes,
      moreLabel: t("Tải thêm lớp"),
    },
    {
      label: t("Buổi nhóm tự chọn"),
      items: groups.page?.items.map((item) => ({
        value: `group:${item.id}`,
        label: [
          formatDate(item.sessionDate, locale),
          item.startTime,
          t("{0} học viên", { "0": item.studentIds.length }),
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      list: groups,
      moreLabel: t("Tải thêm buổi nhóm/lớp"),
    },
  ];
  return (
    <div className="space-y-2">
      <label className="field-label">
        {t("Nhóm hoặc lớp")}
        <select
          className="select-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("Tất cả nhóm và lớp")}</option>
          {value &&
            !options.some(({ items }) =>
              items?.some((item) => item.value === value),
            ) && <option value={value}>{t("Nhóm hoặc lớp đã chọn")}</option>}
          {options.map(({ label, items }) =>
            items?.length ? (
              <optgroup key={label} label={label}>
                {items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </label>
      {options.some(({ list }) => !list.page && !list.error) && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Đang tải…")}
        </p>
      )}
      {options.map(({ label, list, moreLabel }) =>
        list.error || list.page?.nextCursor ? (
          <div key={label}>
            {list.error && (
              <LoadError message={list.error} retry={list.reload} />
            )}
            {list.page?.nextCursor && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={list.moreBusy}
                onClick={list.more}
              >
                {list.moreBusy ? t("Đang tải…") : moreLabel}
              </Button>
            )}
          </div>
        ) : null,
      )}
    </div>
  );
}
