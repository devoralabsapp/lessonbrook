"use client";
import { useI18n } from "@/lib/i18n/client";

import { useState } from "react";
import Link from "@/components/workspace-link";
import { formatVnd, statusLabels, type TeachingSession } from "@/domain";
import { canCompleteSession } from "@/domain/session-completion";
import { LessonPaymentStatus } from "@/components/lesson-payment-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordForm } from "@/components/record-form";
import { formatDate } from "@/features/statements/shared";
import { LessonForm, type LessonDetailData } from "./lesson-form";
import { LoadError, useResource } from "./shared";
export function LessonDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const resource = useResource<LessonDetailData>(
    `/api/lessons/${encodeURIComponent(id)}`,
  );
  const [editing, setEditing] = useState<"edit" | "complete" | null>(null);
  const [participant, setParticipant] = useState<{
    record: TeachingSession;
    complete?: true;
  } | null>(null);
  const [message, setMessage] = useState("");
  const item = resource.data;
  if (resource.error)
    return <LoadError message={resource.error} retry={resource.reload} />;
  if (!item) return <p role="status">{t("Đang mở buổi học…")}</p>;
  const locked = item.sessions.some((s) => s.billedStatementId !== null);
  return (
    <div className="space-y-6 fade-in">
      <Link
        href={item.classId ? `/app/classes/${item.classId}` : "/app/lessons"}
        className="text-sm text-primary underline"
      >
        ← {item.classId ? t("Về lớp học") : t("Buổi nhóm & lớp")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="serif break-words text-3xl">
            {item.className ?? t("Buổi nhóm tự chọn")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {formatDate(item.sessionDate, locale)}
            {item.startTime ? ` · ${item.startTime}` : ""}
            {item.durationMinutes
              ? t(" · {0} phút", { "0": item.durationMinutes })
              : ""}{" "}
            · {item.sessions.length}
            {t(" học viên")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked && item.sessions.some(canCompleteSession) && (
            <Button disabled={!!editing} onClick={() => setEditing("complete")}>
              {t("Đánh dấu hoàn thành")}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={locked || !!editing}
            onClick={() => setEditing("edit")}
          >
            {t("Sửa thông tin chung")}
          </Button>
        </div>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {t("Đơn giá đã lưu: ")}
        {formatVnd(item.rateVnd, locale)}
        {t(" / người. Tổng học phí đã dạy:")}{" "}
        <strong className="text-foreground">
          {formatVnd(
            item.sessions.reduce((sum, s) => sum + s.amountVnd, 0),
            locale,
          )}
        </strong>
        {t(". Mỗi học viên có dòng học phí và bảng kê riêng.")}
        {locked
          ? t(" Thông tin chung đã khóa vì có học viên được lập bảng kê.")
          : ""}
      </p>
      {message && (
        <p role="status" className="rounded-xl bg-accent-soft p-4 text-sm">
          {t(message)}
        </p>
      )}
      {editing && (
        <LessonForm
          record={item}
          completePlanned={editing === "complete"}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage(t("Đã lưu thông tin chung của buổi."));
            resource.reload();
          }}
        />
      )}
      <Card className="divide-y divide-border">
        {item.sessions.map((s) => (
          <div
            key={s.id}
            data-slot="lesson-participant"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 p-5 sm:gap-x-4"
          >
            <div className="min-w-0 space-y-1">
              <Link
                className="break-words font-semibold text-primary"
                href={`/app/students/${s.studentId}`}
              >
                {s.studentName}
              </Link>
              <strong className="block break-words text-sm">
                {s.billable
                  ? formatVnd(
                      s.status === "completed" ? s.amountVnd : s.rateVnd,
                      locale,
                    )
                  : t("Miễn phí")}
              </strong>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="lesson-participant-actions flex items-center gap-1">
                <span className={`status status-${s.status}`}>
                  {t(statusLabels[s.status])}
                </span>
                <LessonPaymentStatus session={s} />
                <button
                  type="button"
                  className="status bg-card hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  aria-label={t("Sửa {0}", { "0": s.studentName })}
                  disabled={s.billedStatementId !== null}
                  onClick={() => setParticipant({ record: s })}
                >
                  {t("Sửa")}
                </button>
              </div>
              {locked && canCompleteSession(s) && (
                <button
                  type="button"
                  className="text-right text-xs text-primary underline"
                  onClick={() => setParticipant({ record: s, complete: true })}
                >
                  {t("Đánh dấu hoàn thành")}
                </button>
              )}
              {s.billedStatementId ? (
                <Link
                  href={`/app/statements/${s.billedStatementId}`}
                  className="text-right text-xs text-primary underline"
                >
                  {t("Mở bảng kê")}
                </Link>
              ) : s.status === "completed" && s.billable ? (
                <Link
                  href={`/app/statements/new?studentId=${s.studentId}`}
                  className="text-right text-xs text-primary underline"
                >
                  {t("Lập bảng kê")}
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </Card>
      {item.privateNote && (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold">
            {t("Ghi chú riêng của buổi")}
          </h2>
          <p className="whitespace-pre-wrap break-words text-sm">
            {item.privateNote}
          </p>
        </Card>
      )}
      {participant && (
        <RecordForm
          kind="session"
          record={participant.record}
          initialStatus={participant.complete ? "completed" : undefined}
          onClose={() => setParticipant(null)}
          onSaved={(message) => {
            setParticipant(null);
            setMessage(message);
            resource.reload();
          }}
        />
      )}
    </div>
  );
}
