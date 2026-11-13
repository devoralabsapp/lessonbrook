"use client";
import type { SessionWithPayment } from "@/domain/list-filters";
import { useI18n } from "@/lib/i18n/client";

import { useState } from "react";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import { useRouter } from "next/navigation";
import { useWorkspaceHref } from "@/components/workspace-link";
import {
  formatVnd,
  MAX_VND,
  vietnamToday,
  type Student,
  type TeachingSession,
} from "@/domain";
import type { GroupLesson } from "@/domain/classes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedDateField } from "@/components/ui/themed-date-field";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useStatementMutation } from "@/features/statements/shared";
import { ClassLessonRoster, useClassLessonRoster } from "./lesson-roster";
import { MemberPicker } from "./shared";
export type LessonDetailData = GroupLesson & {
  sessions: SessionWithPayment[];
};
export function LessonForm({
  initialClassId = "",
  initialMode = "group",
  scheduledSlot,
  record,
  onSaved,
  onCancel,
}: {
  initialClassId?: string;
  initialMode?: string;
  scheduledSlot?: { date: string; time: string };
  record?: LessonDetailData;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const workspaceHref = useWorkspaceHref();
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const [mode, setMode] = useState(
    initialClassId || record?.classId || initialMode === "class"
      ? "class"
      : "group",
  );
  const selectingClass = !record && mode === "class";
  const roster = useClassLessonRoster(selectingClass, initialClassId);
  const [members, setMembers] = useState<Student[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [price, setPrice] = useState(record?.rateVnd ?? 200000);
  const [date, setDate] = useState(
    () => record?.sessionDate ?? scheduledSlot?.date ?? vietnamToday(),
  );
  const rate = selectingClass ? (roster.data?.rateVnd ?? 0) : price;
  const [status, setStatus] = useState<TeachingSession["status"]>(
    scheduledSlot ? "planned" : "completed",
  );
  const [billable, setBillable] = useState(true);
  const [applyStatus, setApplyStatus] = useState(!record);
  const classReady =
    !selectingClass || (!!roster.data && !roster.data.archivedAt);
  const studentIds =
    record?.studentIds ??
    (selectingClass ? roster.studentIds : members.map((student) => student.id));
  const count = studentIds.length;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!count) {
      setSelectionError(t("Chọn ít nhất một học viên tham gia buổi."));
      return;
    }
    if (!classReady) return;
    setSelectionError("");
    const form = new FormData(e.currentTarget);
    const result = await mutation.run(
      `/api/lessons${record ? `/${record.id}` : ""}`,
      record ? "PATCH" : "POST",
      {
        classId: record?.classId ?? (selectingClass ? roster.classId : null),
        studentIds,
        rateVnd: rate,
        sessionDate: String(form.get("sessionDate")),
        startTime: String(form.get("startTime")) || null,
        durationMinutes: form.get("durationMinutes")
          ? Number(form.get("durationMinutes"))
          : null,
        status: applyStatus ? status : null,
        billable: applyStatus
          ? status === "cancelled"
            ? false
            : billable
          : null,
        privateNote: String(form.get("privateNote")),
      },
    );
    if (result) {
      draft.saved();
      if (onSaved) onSaved();
      else router.push(workspaceHref(`/app/lessons/${result.id}`));
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} {...draft.form} className="space-y-5">
        <fieldset disabled={mutation.busy} className="min-w-0 space-y-5">
          {!record && (
            <label className="field-label">
              {t("Dạy cho")}
              <ThemedSelect
                label={t("Dạy cho")}
                value={mode}
                onChange={(value) => {
                  draft.changed();
                  setMode(value);
                  setMembers([]);
                  roster.chooseClass(roster.classId);
                  setSelectionError("");
                }}
                options={[
                  { value: "group", label: t("Nhóm học viên tự chọn") },
                  { value: "class", label: t("Một lớp học") },
                ]}
              />
            </label>
          )}
          {selectingClass && (
            <ClassLessonRoster
              roster={roster}
              showClassesLink
              onChange={() => {
                draft.changed();
                setSelectionError("");
              }}
            />
          )}
          {record ? (
            <div>
              <p className="text-sm font-semibold">
                {record.className ?? t("Nhóm tự chọn")} · {count}
                {t(" học viên")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Danh sách tham gia được giữ cố định:")}{" "}
                {record.sessions.map((s) => s.studentName).join(", ")}
                {t(". Có thể hủy hoặc miễn phí riêng từng người ở chi tiết.")}
              </p>
            </div>
          ) : mode === "group" ? (
            <MemberPicker
              value={members}
              onChange={(value) => {
                draft.changed();
                setMembers(value);
              }}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <ThemedDateField
              label={t("Ngày dạy *")}
              name="sessionDate"
              required
              value={date}
              onChange={(value) => {
                draft.changed();
                setDate(value);
              }}
            />
            <label className="field-label">
              {t("Giờ bắt đầu")}
              <Input
                name="startTime"
                type="time"
                defaultValue={record?.startTime ?? scheduledSlot?.time ?? ""}
              />
            </label>
            <label className="field-label">
              {t("Thời lượng (phút)")}
              <Input
                name="durationMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                defaultValue={record?.durationMinutes ?? ""}
              />
            </label>
            <label className="field-label">
              {t("Học phí / người (VND) *")}
              <Input
                type="number"
                inputMode="numeric"
                required
                min={0}
                max={MAX_VND}
                step={1}
                readOnly={mode === "class" && !record}
                value={rate}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Một mức giá cho mỗi người tham gia, không chia tổng buổi theo sĩ số.",
            )}
            {mode === "class" && !record
              ? t(
                  " Giá lấy từ lớp; sửa giá trong thông tin lớp trước khi ghi nếu cần.",
                )
              : ""}{" "}
            {t("Giá được giữ riêng cho buổi này.")}
          </p>
          {record && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={applyStatus}
                onChange={(e) => setApplyStatus(e.target.checked)}
                className="accent-primary"
              />
              {t("Cập nhật trạng thái và tính phí cho tất cả học viên")}
            </label>
          )}
          {applyStatus && (
            <div className="space-y-3">
              <label className="field-label">
                {t("Trạng thái chung")}
                <ThemedSelect
                  label={t("Trạng thái chung")}
                  value={status}
                  onChange={(value) => {
                    draft.changed();
                    setStatus(value);
                  }}
                  options={[
                    { value: "completed", label: t("Đã dạy") },
                    { value: "planned", label: t("Dự kiến") },
                    { value: "cancelled", label: t("Đã hủy") },
                  ]}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={status !== "cancelled" && billable}
                  disabled={status === "cancelled"}
                  onChange={(e) => setBillable(e.target.checked)}
                />
                {t("Tính phí cho người tham gia")}
              </label>
            </div>
          )}
          <div className="rounded-xl bg-accent-soft p-4 text-sm">
            <p>
              {count}
              {t(" học viên × ")}
              {formatVnd(rate, locale)}
              {t(" / người")}
            </p>
            <p className="mt-2 font-semibold">
              {applyStatus
                ? t("Tổng {0}: {1}", {
                    "0": status === "planned" ? t("dự kiến") : t("học phí"),
                    "1": formatVnd(
                      billable && status !== "cancelled" ? count * rate : 0,
                      locale,
                    ),
                  })
                : t("Trạng thái và miễn phí từng học viên được giữ nguyên.")}
            </p>
          </div>
          <label className="field-label">
            {t("Ghi chú riêng của buổi")}
            <textarea
              name="privateNote"
              rows={3}
              maxLength={1000}
              className="select-input"
              defaultValue={record?.privateNote}
            />
          </label>
        </fieldset>
        {(mutation.error || selectionError) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error || selectionError}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.busy}
              onClick={onCancel}
            >
              {t("Để sau")}
            </Button>
          )}
          <Button disabled={mutation.busy || !classReady}>
            {mutation.busy
              ? t("Đang lưu…")
              : record
                ? t("Lưu thay đổi buổi")
                : t("Lưu buổi nhóm/lớp")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
