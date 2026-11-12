"use client";

import { useState } from "react";
import Link from "@/components/workspace-link";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { TeachingClass } from "@/domain/classes";
import { useI18n } from "@/lib/i18n/client";
import type { ClassDetail } from "./class-form";
import { LoadError, usePaged, useResource } from "./shared";

export function useClassLessonRoster(enabled: boolean, initialClassId = "") {
  const [classId, setClassId] = useState(initialClassId);
  const [excluded, setExcluded] = useState<string[]>([]);
  const resource = useResource<ClassDetail>(
    enabled && classId ? `/api/classes/${encodeURIComponent(classId)}` : null,
  );
  const activeStudents =
    resource.data?.students.filter((student) => !student.archivedAt) ?? [];
  const studentIds = activeStudents
    .filter((student) => !excluded.includes(student.id))
    .map((student) => student.id);

  return {
    ...resource,
    classId,
    studentIds,
    activeCount: activeStudents.length,
    chooseClass(value: string) {
      setClassId(value);
      setExcluded([]);
    },
    setAttending(id: string, attending: boolean) {
      setExcluded((current) =>
        attending ? current.filter((item) => item !== id) : [...current, id],
      );
    },
  };
}

export function ClassLessonRoster({
  roster,
  onChange,
  showClassesLink = false,
}: {
  roster: ReturnType<typeof useClassLessonRoster>;
  onChange: () => void;
  showClassesLink?: boolean;
}) {
  const { t } = useI18n();
  const classes = usePaged<TeachingClass>("/api/classes?limit=50");
  const { classId, data, studentIds } = roster;
  const options = classes.page?.items ?? [];
  return (
    <div className="space-y-3">
      <ThemedSelect
        label={t("Lớp học *")}
        field
        value={classId}
        required
        onChange={(value) => {
          roster.chooseClass(value);
          onChange();
        }}
        options={[
          { value: "", label: t("Chọn lớp") },
          ...(classId && !options.some((item) => item.id === classId)
            ? [
                {
                  value: classId,
                  label: data?.displayName ?? t("Lớp đang chọn"),
                },
              ]
            : []),
          ...options.map((item) => ({
            value: item.id,
            label: item.displayName,
          })),
        ]}
      />
      {!classes.page && !classes.error && (
        <p role="status" className="text-xs">
          {t("Đang tải lớp học…")}
        </p>
      )}
      {classes.page?.nextCursor && (
        <Button
          type="button"
          variant="ghost"
          disabled={classes.moreBusy}
          onClick={classes.more}
        >
          {t("Tải thêm lớp")}
        </Button>
      )}
      {classes.error && (
        <LoadError message={classes.error} retry={classes.reload} />
      )}
      {roster.error && (
        <LoadError message={roster.error} retry={roster.reload} />
      )}
      {classId && !data && !roster.error && (
        <p role="status" className="text-xs">
          {t("Đang tải thành viên và đơn giá lớp…")}
        </p>
      )}
      {data?.archivedAt && (
        <p role="alert" className="text-sm text-destructive">
          {t("Lớp đã lưu trữ. Khôi phục lớp trước khi ghi buổi.")}
        </p>
      )}
      {classes.page &&
        !options.length &&
        !classes.page.nextCursor &&
        !classId &&
        (showClassesLink ? (
          <Link className="text-sm text-primary underline" href="/app/classes">
            {t("Thêm lớp học trước")}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Chưa có lớp đang hoạt động.")}
          </p>
        ))}
      {data && !data.archivedAt && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">
            {t("Người tham gia (")}
            {studentIds.length}/{roster.activeCount})
          </legend>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {data.students.map((student) => (
              <label
                key={student.id}
                className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  disabled={!!student.archivedAt}
                  checked={studentIds.includes(student.id)}
                  onChange={(event) => {
                    roster.setAttending(student.id, event.target.checked);
                    onChange();
                  }}
                />
                <span className="min-w-0 break-words">
                  {student.displayName}
                  {student.archivedAt ? t(" · Đã lưu trữ") : ""}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Bỏ chọn người vắng. Chỉ những người được chọn có học phí buổi này.",
            )}
          </p>
        </fieldset>
      )}
    </div>
  );
}
