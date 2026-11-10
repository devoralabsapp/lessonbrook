"use client";
import { useI18n } from "@/lib/i18n/client";

import { useState } from "react";
import Link from "next/link";
import { formatVnd, statusLabels, type TeachingSession } from "@/domain";
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
  const [editing, setEditing] = useState(false);
  const [participant, setParticipant] = useState<TeachingSession | null>(null);
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
        <Button
          variant="outline"
          disabled={locked || editing}
          onClick={() => setEditing(true)}
        >
          {t("Sửa thông tin chung")}
        </Button>
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
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setMessage(t("Đã lưu thông tin chung của buổi."));
            resource.reload();
          }}
        />
      )}
      <Card className="divide-y divide-border">
        {item.sessions.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-2 items-start gap-3 p-5 sm:flex sm:flex-wrap sm:items-center"
          >
            <div className="col-span-2 min-w-0 sm:basis-40 sm:flex-1">
              <Link
                className="break-words font-semibold text-primary"
                href={`/app/students/${s.studentId}`}
              >
                {s.studentName}
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.billedStatementId
                  ? t("Đã lập bảng kê")
                  : s.status === "completed" && s.billable
                    ? t("Chưa lập bảng kê")
                    : t("Chưa tính học phí")}
              </p>
            </div>
            <span className={`status justify-self-start status-${s.status}`}>
              {t(statusLabels[s.status])}
            </span>
            <strong className="justify-self-end text-sm">
              {s.billable
                ? formatVnd(
                    s.status === "completed" ? s.amountVnd : s.rateVnd,
                    locale,
                  )
                : t("Miễn phí")}
            </strong>
            <Button
              className="justify-self-start"
              aria-label={t("Sửa {0}", { "0": s.studentName })}
              size="sm"
              variant="ghost"
              disabled={s.billedStatementId !== null}
              onClick={() => setParticipant(s)}
            >
              {t("Sửa")}
            </Button>
            {s.billedStatementId ? (
              <Link
                href={`/app/statements/${s.billedStatementId}`}
                className="justify-self-end text-xs text-primary underline"
              >
                {t("Mở bảng kê")}
              </Link>
            ) : s.status === "completed" && s.billable ? (
              <Link
                href={`/app/statements/new?studentId=${s.studentId}`}
                className="justify-self-end text-xs text-primary underline"
              >
                {t("Lập bảng kê")}
              </Link>
            ) : null}
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
          record={participant}
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
