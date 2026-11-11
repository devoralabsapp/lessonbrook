"use client";

import Link from "next/link";
import { useState } from "react";
import { formatVnd, statusLabels, type TeachingSession } from "@/domain";
import { RecordForm } from "@/components/record-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadError, useResource } from "@/features/classes/shared";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";

export function SessionDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const session = useResource<TeachingSession>(
    `/api/sessions/${encodeURIComponent(id)}`,
  );
  const [editing, setEditing] = useState<"edit" | "complete" | null>(null);
  const [message, setMessage] = useState("");
  if (session.error)
    return <LoadError message={session.error} retry={session.reload} />;
  if (!session.data) return <p role="status">{t("Đang mở buổi học…")}</p>;
  const lesson = session.data;
  return (
    <div className="space-y-4">
      <Link className="text-sm text-primary underline" href="/app/schedule">
        {t("Lịch dạy sắp tới")}
      </Link>
      <h1 className="serif break-words text-3xl">{lesson.studentName}</h1>
      {message && <p role="status">{message}</p>}
      <Card className="space-y-3">
        <p>
          {formatDate(lesson.sessionDate, locale)} ·{" "}
          {lesson.startTime ?? t("Chưa đặt giờ")}
        </p>
        <p>
          {t(statusLabels[lesson.status])} · {formatVnd(lesson.rateVnd, locale)}
        </p>
        <div className="flex flex-wrap gap-2">
          {lesson.status === "planned" && !lesson.billedStatementId && (
            <Button onClick={() => setEditing("complete")}>
              {t("Đánh dấu hoàn thành")}
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditing("edit")}>
            {t("Sửa buổi dạy")}
          </Button>
        </div>
      </Card>
      {editing && (
        <RecordForm
          kind="session"
          record={lesson}
          initialStatus={editing === "complete" ? "completed" : undefined}
          onClose={() => setEditing(null)}
          onSaved={(notice) => {
            setMessage(notice);
            setEditing(null);
            session.reload();
          }}
        />
      )}
    </div>
  );
}
