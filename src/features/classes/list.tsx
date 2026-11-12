"use client";

import {
  CalendarViewSwitch,
  WorkspaceMonthCalendar,
} from "@/features/calendar/month-view";
import { useState } from "react";
import Link, { useWorkspaceHref } from "@/components/workspace-link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import type { TeachingClass } from "@/domain/classes";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useStatementMutation } from "@/features/statements/shared";
import { ClassForm, type ClassDetail } from "./class-form";
import { LoadError, usePaged } from "./shared";

export function ClassesList() {
  const { t } = useI18n();
  const router = useRouter();
  const workspaceHref = useWorkspaceHref();
  const [calendarView, setCalendarView] = useState<"list" | "month">("list");
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<{ record?: ClassDetail } | null>(null);
  const [opening, setOpening] = useState("");
  const [editError, setEditError] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useStatementMutation();
  const term = useDebounced(search);
  const list = usePaged<TeachingClass>(
    `/api/classes?${new URLSearchParams({ q: term, archived: String(archived) })}`,
  );

  async function edit(id: string) {
    setOpening(id);
    setEditError("");
    try {
      setForm({ record: await api<ClassDetail>(`/api/classes/${id}`) });
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : t("Chưa tải được dữ liệu."),
      );
    } finally {
      setOpening("");
    }
  }

  async function archive(item: TeachingClass) {
    setNotice("");
    const result = await mutation.run(
      `/api/classes/${item.id}/archive`,
      "POST",
      {
        archived: !item.archivedAt,
      },
    );
    if (result) {
      list.reload();
      setCalendarRevision((value) => value + 1);
      setNotice(
        item.archivedAt ? t("Đã khôi phục lớp.") : t("Đã lưu trữ lớp."),
      );
    }
  }

  return (
    <div className="fade-in">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
            {t("SỔ BUỔI DẠY & HỌC PHÍ")}
          </p>
          <h1 className="serif text-3xl leading-tight sm:text-4xl">
            {t("Lớp học")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t(
              "Gom học viên vào lớp, ghi một buổi và tính học phí riêng từng người.",
            )}
          </p>
        </div>
        <Button onClick={() => setForm({})} disabled={!!opening}>
          <Plus />
          {t("Thêm lớp học")}
        </Button>
      </div>
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-border bg-accent-soft px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">{t("Danh sách lớp học")}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("Chạm vào tên để mở chi tiết lớp")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CalendarViewSwitch
              value={calendarView}
              onChange={setCalendarView}
            />
            <ThemedSelect
              label={t("Trạng thái lớp học")}
              toolbar
              value={String(archived)}
              onChange={(value) => {
                setArchived(value === "true");
                setNotice("");
                setEditError("");
                mutation.clearError();
              }}
              options={[
                { value: "false", label: t("Đang hoạt động") },
                { value: "true", label: t("Đã lưu trữ") },
              ]}
            />
          </div>
        </div>
        <div className="border-b border-border p-4">
          <label className="field-label min-w-0">
            {t("Tìm tên lớp")}
            <Input
              type="search"
              maxLength={100}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Có dấu hoặc không dấu")}
            />
          </label>
        </div>
        {calendarView === "list" && list.error && (
          <div className="px-5">
            <LoadError message={list.error} retry={list.reload} />
          </div>
        )}
        {(editError || mutation.error) && (
          <p
            role="alert"
            className="border-b border-border px-5 py-3 text-sm text-destructive"
          >
            {t(editError || mutation.error)}
          </p>
        )}
        {calendarView === "list" && !list.page && !list.error && (
          <p
            role="status"
            className="flex justify-center gap-2 p-14 text-sm text-muted-foreground"
          >
            <LoaderCircle size={18} className="animate-spin" />
            {t("Đang tải lớp học…")}
          </p>
        )}
        {calendarView === "month" && (
          <WorkspaceMonthCalendar
            kind="classes"
            endpoint={`/api/classes?${new URLSearchParams({ q: term, archived: String(archived) })}`}
            revision={calendarRevision}
          />
        )}
        {calendarView === "list" &&
          list.page &&
          (list.page.items.length ? (
            <div className="divide-y divide-border">
              {list.page.items.map((item, index) => (
                <div
                  key={item.id}
                  data-list-tone={
                    item.archivedAt ? "neutral" : index % 2 ? "blue" : "yellow"
                  }
                  className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-semibold text-primary"
                  >
                    {item.displayName[0]}
                  </span>
                  <Link
                    href={`/app/classes/${item.id}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="block break-words text-sm font-semibold">
                      {item.displayName}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("{0} học viên", { "0": item.studentIds.length })}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!opening || mutation.busy}
                    onClick={() => void edit(item.id)}
                  >
                    {opening === item.id ? t("Đang tải…") : t("Sửa")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!opening || mutation.busy}
                    onClick={() => void archive(item)}
                  >
                    {item.archivedAt ? t("Khôi phục") : t("Lưu trữ")}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div role="status" className="p-8 text-center text-sm">
              {search.trim() || list.page.nextCursor
                ? t("Chưa thấy lớp phù hợp.")
                : t("Chưa có lớp trong danh sách này.")}
            </div>
          ))}
        {calendarView === "list" && list.page?.nextCursor && (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={list.moreBusy || search !== term}
              onClick={list.more}
            >
              {list.moreBusy ? t("Đang tải…") : t("Tải tiếp lớp học")}
            </Button>
          </div>
        )}
      </Card>
      {form && (
        <ClassForm
          record={form.record}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            if (form.record) {
              list.reload();
              setCalendarRevision((value) => value + 1);
            } else router.push(workspaceHref(`/app/classes/${id}`));
          }}
        />
      )}
    </div>
  );
}
