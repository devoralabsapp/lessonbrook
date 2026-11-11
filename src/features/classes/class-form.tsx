"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useRef, useState } from "react";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import type { Student } from "@/domain";
import { MAX_VND } from "@/domain";
import {
  MAX_WEEKLY_SLOTS,
  weekdays,
  type TeachingClass,
  type WeeklySlot,
} from "@/domain/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useStatementMutation } from "@/features/statements/shared";
import { MemberPicker } from "./shared";
export type ClassDetail = TeachingClass & {
  students: Student[];
};
export function ClassForm({
  record,
  onClose,
  onSaved,
}: {
  record?: ClassDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [members, setMembers] = useState<Student[]>(record?.students ?? []);
  const [slots, setSlots] = useState<(WeeklySlot & { key: string })[]>(() =>
    (record?.weeklySchedule ?? []).map((slot, index) => ({
      ...slot,
      key: String(index),
    })),
  );
  const [selectionError, setSelectionError] = useState("");
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  function updateSlot(key: string, change: Partial<WeeklySlot>) {
    draft.changed();
    setSlots((current) =>
      current.map((slot) => (slot.key === key ? { ...slot, ...change } : slot)),
    );
  }
  useEffect(() => {
    const el = dialog.current,
      trigger = document.activeElement;
    el?.showModal();
    el?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      el?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [t]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!members.length) {
      setSelectionError(t("Chọn ít nhất một học viên cho lớp."));
      return;
    }
    setSelectionError("");
    const form = new FormData(e.currentTarget);
    const result = await mutation.run(
      `/api/classes${record ? `/${record.id}` : ""}`,
      record ? "PATCH" : "POST",
      {
        displayName: String(form.get("displayName")),
        rateVnd: Number(form.get("rateVnd")),
        privateNote: String(form.get("privateNote")),
        studentIds: members.map((s) => s.id),
        weeklySchedule: slots.map(({ weekday, time }) => ({ weekday, time })),
      },
    );
    if (result) {
      draft.saved();
      onSaved(result.id);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="class-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!mutation.busy) onClose();
      }}
    >
      <form onSubmit={submit} {...draft.form} className="space-y-5 p-6">
        <h2 id="class-title" className="serif text-2xl">
          {record ? t("Sửa lớp học") : t("Thêm lớp học")}
        </h2>
        <fieldset disabled={mutation.busy} className="space-y-4">
          <label className="field-label">
            {t("Tên lớp *")}
            <Input
              name="displayName"
              required
              maxLength={100}
              defaultValue={record?.displayName}
              placeholder={t("Ví dụ: Piano tối thứ Ba")}
            />
          </label>
          <label className="field-label">
            {t("Học phí mỗi học viên / buổi (VND) *")}
            <Input
              name="rateVnd"
              type="number"
              inputMode="numeric"
              required
              min={0}
              max={MAX_VND}
              step={1}
              defaultValue={record?.rateVnd ?? 200000}
            />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Cùng một đơn giá cho mỗi người tham gia. Đổi giá hoặc thành viên lớp chỉ ảnh hưởng buổi mới; học phí cũ được giữ nguyên. Một học viên có thể ở nhiều lớp.",
            )}
          </p>
          <MemberPicker
            value={members}
            onChange={(value) => {
              draft.changed();
              setMembers(value);
            }}
          />
          <fieldset className="min-w-0 space-y-3">
            <legend className="text-sm font-semibold">
              {t("Lịch học hằng tuần")}
            </legend>
            <p className="text-xs text-muted-foreground">
              {t("Giờ Việt Nam. Lịch xuất hiện trong các buổi sắp tới.")}
            </p>
            {slots.map((slot, index) => (
              <div
                key={slot.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
              >
                <label className="field-label min-w-0">
                  <span className={index ? "sr-only" : undefined}>
                    {t("Ngày trong tuần")}
                  </span>
                  <ThemedSelect
                    label={t("Ngày trong tuần")}
                    value={String(slot.weekday)}
                    onChange={(value) =>
                      updateSlot(slot.key, { weekday: Number(value) })
                    }
                    options={weekdays.map((day, index) => ({
                      value: String(index + 1),
                      label: t(day),
                    }))}
                  />
                </label>
                <label className="field-label min-w-0">
                  <span className={index ? "sr-only" : undefined}>
                    {t("Giờ bắt đầu")}
                  </span>
                  <Input
                    type="time"
                    value={slot.time}
                    required
                    onChange={(e) =>
                      updateSlot(slot.key, { time: e.target.value })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("Xóa giờ học {0}", { "0": index + 1 })}
                  onClick={() => {
                    draft.changed();
                    setSlots((current) =>
                      current.filter((item) => item.key !== slot.key),
                    );
                  }}
                >
                  {t("Xóa")}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={slots.length >= MAX_WEEKLY_SLOTS}
              onClick={() => {
                draft.changed();
                const weekday =
                  weekdays.findIndex(
                    (_, index) =>
                      !slots.some((slot) => slot.weekday === index + 1),
                  ) + 1;
                setSlots([
                  ...slots,
                  {
                    key: crypto.randomUUID(),
                    weekday: weekday || 1,
                    time: slots.at(-1)?.time || "20:00",
                  },
                ]);
              }}
            >
              {t("Thêm giờ học")}
            </Button>
          </fieldset>
          <label className="field-label">
            {t("Ghi chú riêng")}
            <textarea
              className="select-input"
              rows={3}
              name="privateNote"
              maxLength={1000}
              defaultValue={record?.privateNote}
            />
          </label>
        </fieldset>
        {(mutation.error || selectionError) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error || selectionError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {t("Để sau")}
          </Button>
          <Button disabled={mutation.busy}>
            {mutation.busy ? t("Đang lưu…") : t("Lưu lớp học")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
