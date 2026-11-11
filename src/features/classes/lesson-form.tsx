"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatVnd,
  MAX_VND,
  vietnamToday,
  type Student,
  type TeachingSession,
} from "@/domain";
import type { GroupLesson, TeachingClass } from "@/domain/classes";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStatementMutation } from "@/features/statements/shared";
import type { ClassDetail } from "./class-form";
import { LoadError, MemberPicker, usePaged } from "./shared";
export type LessonDetailData = GroupLesson & {
  sessions: TeachingSession[];
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
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const [mode, setMode] = useState(
    initialClassId || record?.classId || initialMode === "class"
      ? "class"
      : "group",
  );
  const [classId, setClassId] = useState(record?.classId ?? initialClassId);
  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [classError, setClassError] = useState("");
  const [retry, setRetry] = useState(0);
  const classes = usePaged<TeachingClass>("/api/classes?limit=50");
  const [members, setMembers] = useState<Student[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [rate, setRate] = useState(record?.rateVnd ?? 200000);
  const [status, setStatus] = useState<TeachingSession["status"]>(
    scheduledSlot ? "planned" : "completed",
  );
  const [billable, setBillable] = useState(true);
  const [applyStatus, setApplyStatus] = useState(!record);
  useEffect(() => {
    if (record || mode !== "class" || !classId) return;
    let active = true;
    api<ClassDetail>(`/api/classes/${encodeURIComponent(classId)}`)
      .then((data) => {
        if (active) {
          setClassData(data);
          setMembers(data.students.filter((s) => !s.archivedAt));
          setRate(data.rateVnd);
          setClassError("");
        }
      })
      .catch((e) => {
        if (active)
          setClassError(
            e instanceof Error ? e.message : t("Chưa tải được lớp."),
          );
      });
    return () => {
      active = false;
    };
  }, [classId, mode, record, retry, t]);
  const classReady =
    !!record || mode !== "class" || (classData?.id === classId && !classError);
  const count = record?.studentIds.length ?? members.length;
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
        classId: mode === "class" ? classId : null,
        studentIds: record?.studentIds ?? members.map((s) => s.id),
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
      else router.push(`/app/lessons/${result.id}`);
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} {...draft.form} className="space-y-5">
        <fieldset disabled={mutation.busy} className="min-w-0 space-y-5">
          {!record && (
            <label className="field-label">
              {t("Dạy cho")}
              <select
                className="select-input"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setMembers([]);
                  setClassData(null);
                  setSelectionError("");
                }}
              >
                <option value="group">{t("Nhóm học viên tự chọn")}</option>
                <option value="class">{t("Một lớp học")}</option>
              </select>
            </label>
          )}
          {mode === "class" && !record && (
            <div className="space-y-3">
              <label className="field-label">
                {t("Lớp học *")}
                <select
                  className="select-input"
                  value={classId}
                  required
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setClassData(null);
                    setMembers([]);
                    setClassError("");
                  }}
                >
                  <option value="">{t("Chọn lớp")}</option>
                  {classId &&
                    !classes.page?.items.some((c) => c.id === classId) && (
                      <option value={classId}>
                        {classData?.displayName ?? t("Lớp đang chọn")}
                      </option>
                    )}
                  {classes.page?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
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
              {classError && (
                <LoadError
                  message={classError}
                  retry={() => setRetry((v) => v + 1)}
                />
              )}
              {classId && !classReady && !classError && (
                <p role="status" className="text-xs">
                  {t("Đang tải thành viên và đơn giá lớp…")}
                </p>
              )}
              {classData?.id === classId && classData.archivedAt && (
                <p role="alert" className="text-sm text-destructive">
                  {t("Lớp đã lưu trữ. Khôi phục lớp trước khi ghi buổi.")}
                </p>
              )}
              {classes.page &&
                !classes.page.items.length &&
                !classes.page.nextCursor && (
                  <Link
                    className="text-sm text-primary underline"
                    href="/app/classes"
                  >
                    {t("Thêm lớp học trước")}
                  </Link>
                )}
            </div>
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
          ) : classReady && classData ? (
            <fieldset className="space-y-2">
              <legend className="mb-3 text-sm font-semibold">
                {t("Người tham gia (")}
                {count}/{classData.students.filter((s) => !s.archivedAt).length}
                )
              </legend>
              {classData.students.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    disabled={!!s.archivedAt}
                    checked={members.some((m) => m.id === s.id)}
                    onChange={(e) =>
                      setMembers(
                        e.target.checked
                          ? [...members, s]
                          : members.filter((m) => m.id !== s.id),
                      )
                    }
                  />
                  <span className="min-w-0 break-words">
                    {s.displayName}
                    {s.archivedAt ? t(" · Đã lưu trữ") : ""}
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                {t(
                  "Bỏ chọn người vắng. Chỉ những người được chọn có học phí buổi này.",
                )}
              </p>
            </fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <label className="field-label">
              {t("Ngày dạy *")}
              <Input
                name="sessionDate"
                type="date"
                required
                min="1900-01-01"
                max="2100-12-31"
                defaultValue={
                  record?.sessionDate ?? scheduledSlot?.date ?? vietnamToday()
                }
              />
            </label>
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
                onChange={(e) => setRate(Number(e.target.value))}
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
                <select
                  className="select-input"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as TeachingSession["status"])
                  }
                >
                  <option value="completed">{t("Đã dạy")}</option>
                  <option value="planned">{t("Dự kiến")}</option>
                  <option value="cancelled">{t("Đã hủy")}</option>
                </select>
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
          <Button
            disabled={
              mutation.busy ||
              !classReady ||
              (!record && mode === "class" && !!classData?.archivedAt)
            }
          >
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
