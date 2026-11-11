"use client";

import type { GroupLesson, TeachingClass } from "@/domain/classes";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
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
  const items = options.flatMap(({ label, items }) =>
    items?.map((item) => ({ ...item, group: label })) ?? [],
  );
  return (
    <div className="space-y-2">
      <label className="field-label">
        {t("Nhóm hoặc lớp")}
        <ThemedSelect
          label={t("Nhóm hoặc lớp")}
          value={value}
          onChange={onChange}
          options={[
            { value: "", label: t("Tất cả nhóm và lớp") },
            ...(value && !items.some((item) => item.value === value)
              ? [{ value, label: t("Nhóm hoặc lớp đã chọn") }]
              : []),
            ...items,
          ]}
        />
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
