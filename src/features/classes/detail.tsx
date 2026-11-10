"use client";
import { useI18n } from "@/lib/i18n/client";

import { useState } from "react";
import Link from "next/link";
import { formatVnd } from "@/domain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStatementMutation } from "@/features/statements/shared";
import { ClassForm, type ClassDetail as Detail } from "./class-form";
import { LessonsList } from "./lessons-list";
import { LoadError, useResource } from "./shared";
export function ClassDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const resource = useResource<Detail>(
    `/api/classes/${encodeURIComponent(id)}`,
  );
  const [editing, setEditing] = useState(false);
  const mutation = useStatementMutation();
  const item = resource.data;
  async function archive() {
    if (!item) return;
    const result = await mutation.run(`/api/classes/${id}/archive`, "POST", {
      archived: !item.archivedAt,
    });
    if (result) resource.reload();
  }
  if (resource.error)
    return <LoadError message={resource.error} retry={resource.reload} />;
  if (!item) return <p role="status">{t("Đang mở lớp…")}</p>;
  return (
    <div className="space-y-6 fade-in">
      <Link href="/app/classes" className="text-sm text-primary underline">
        {t("← Lớp học")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="serif break-words text-3xl sm:text-4xl">
            {item.displayName}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {formatVnd(item.rateVnd, locale)}
            {t(" / học viên / buổi · ")}
            {item.students.length} {t("học viên")}
            {item.archivedAt ? t(" · Đã lưu trữ") : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("Sửa lớp học")}
          </Button>
          {!item.archivedAt && (
            <Button asChild>
              <Link href={`/app/lessons/new?classId=${id}`}>
                {t("Ghi buổi cho lớp")}
              </Link>
            </Button>
          )}
          <Button variant="ghost" disabled={mutation.busy} onClick={archive}>
            {item.archivedAt ? t("Khôi phục lớp") : t("Lưu trữ lớp")}
          </Button>
        </div>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      <Card className="p-5">
        <h2 className="serif mb-4 text-2xl">{t("Học viên trong lớp")}</h2>
        <p className="mb-4 text-xs leading-5 text-muted-foreground">
          {t(
            "Khi ghi buổi, chỉ chọn những người tham gia. Đổi thành viên hoặc đơn giá lớp không thay đổi buổi cũ.",
          )}
        </p>
        <ul className="divide-y divide-border">
          {item.students.map((s) => (
            <li key={s.id} className="py-3">
              <Link
                className="break-words text-sm font-semibold text-primary"
                href={`/app/students/${s.id}`}
              >
                {s.displayName}
              </Link>
              {s.archivedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("Đã lưu trữ · không thêm vào buổi mới")}
                </span>
              )}
            </li>
          ))}
        </ul>
        {item.privateNote && (
          <p className="mt-4 whitespace-pre-wrap break-words border-t border-border pt-4 text-sm">
            <span className="font-semibold">{t("Ghi chú riêng: ")}</span>
            {item.privateNote}
          </p>
        )}
      </Card>
      <div>
        <h2 className="serif mb-4 text-2xl">{t("Buổi học của lớp")}</h2>
        <LessonsList classId={id} />
      </div>
      {editing && (
        <ClassForm
          record={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            resource.reload();
          }}
        />
      )}
    </div>
  );
}
