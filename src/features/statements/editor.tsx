"use client";

import { useEffect, useState } from "react";
import Link, { useWorkspaceHref } from "@/components/workspace-link";
import { useRouter } from "next/navigation";
import {
  type TeachingSession,
  dateSchema,
  formatVnd,
  vietnamToday,
} from "@/domain";
import {
  addBusinessDays,
  MAX_STATEMENT_SESSIONS,
  periodBounds,
  type Statement,
} from "@/domain/statements";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  formatDate,
  type Page,
  StudentPicker,
  useStatementMutation,
} from "./shared";

export function StatementEditor({
  initial,
  initialStudentId = "",
  onCancel,
  onSaved,
}: {
  initial?: Statement;
  initialStudentId?: string;
  onCancel?: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const workspaceHref = useWorkspaceHref();
  const today = vietnamToday();
  const issued = initial?.status === "issued";
  const [studentId, setStudentId] = useState(
    initial?.studentId ?? initialStudentId,
  );
  const [period, setPeriod] = useState<"week" | "month" | "custom">(
    initial ? "custom" : "month",
  );
  const [custom, setCustom] = useState(() => ({
    start: initial?.periodStart ?? periodBounds("month", today).start,
    end: initial?.periodEnd ?? periodBounds("month", today).end,
  }));
  const { start: periodStart, end: periodEnd } =
    period === "custom" ? custom : periodBounds(period, today);
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ?? addBusinessDays(today, 7),
  );
  const [selection, setSelection] = useState(
    () => new Set(initial?.items.map((item) => item.sessionId)),
  );
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<
    { key: string; items: TeachingSession[] } | { key: string; error: string }
  >();
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const validRange =
    dateSchema.safeParse(periodStart).success &&
    dateSchema.safeParse(periodEnd).success &&
    periodStart <= periodEnd;
  const endpoint =
    studentId && validRange
      ? `/api/statements/eligible?${new URLSearchParams({
          studentId,
          periodStart,
          periodEnd,
          ...(issued && { statementId: initial.id }),
        })}`
      : "";
  const key = `${endpoint}:${revision}`;

  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    async function load() {
      const items: TeachingSession[] = [];
      let cursor: string | null = null;
      do {
        const page: Page<TeachingSession> = await api(
          cursor
            ? `${endpoint}&cursor=${encodeURIComponent(cursor)}`
            : endpoint,
        );
        if (!active) return;
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      setResult({ key, items });
    }
    void load().catch((error) => {
      if (active)
        setResult({
          key,
          error:
            error instanceof Error ? error.message : "Chưa tải được buổi dạy.",
        });
    });
    return () => {
      active = false;
    };
  }, [endpoint, key]);

  const current = result?.key === key ? result : undefined;
  const items = current && "items" in current ? current.items : undefined;
  const error = current && "error" in current ? current.error : undefined;
  const selected = items?.filter((lesson) => selection.has(lesson.id)) ?? [];
  const total = selected.reduce((sum, lesson) => sum + lesson.amountVnd, 0);
  const allSelected = !!items?.length && selected.length === items.length;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!studentId || !validRange || total <= 0) return;
    const result = await mutation.run(
      initial
        ? `/api/statements/${initial.id}/${issued ? "issued" : "publish"}`
        : "/api/statements/issue",
      issued ? "PATCH" : "POST",
      {
        studentId,
        periodStart,
        periodEnd,
        dueDate,
        includeBankDetails: initial?.includeBankDetails ?? false,
        sessionIds: selected.map((item) => item.id).sort(),
        ...(initial ? { version: initial.version } : {}),
      },
    );
    if (result) {
      draft.saved();
      if (onSaved) onSaved(result.id);
      else router.push(workspaceHref(`/app/statements/${result.id}`));
    }
  }

  return (
    <div className="fade-in space-y-5">
      <div>
        <Link href="/app/statements" className="text-xs text-primary">
          {t("← Danh sách bảng kê")}
        </Link>
        <h1 className="serif mt-3 text-3xl">
          {issued
            ? t("Sửa bảng kê")
            : initial
              ? t("Sửa bản nháp")
              : t("Lập bảng kê học phí")}
        </h1>
      </div>
      <form onSubmit={save} {...draft.form}>
        <fieldset disabled={mutation.busy} className="min-w-0 space-y-4">
          <Card className="@container p-4 sm:p-5">
            <div
              className={cn(
                "grid items-start gap-x-3 gap-y-4",
                period === "custom"
                  ? "@min-[30rem]:grid-cols-2 @min-[40rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_repeat(3,minmax(0,1fr))]"
                  : "@min-[30rem]:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))]",
              )}
            >
              <StudentPicker
                value={studentId}
                disabled={issued}
                onChange={(id) => {
                  draft.changed();
                  setStudentId(id);
                  setSelection(new Set());
                }}
              />
              <div className="min-w-0 space-y-2">
                <ThemedSelect
                  label={t("Kỳ học")}
                  field
                  value={period}
                  options={[
                    { value: "week", label: t("Tuần này") },
                    { value: "month", label: t("Tháng này") },
                    { value: "custom", label: t("Tùy chỉnh") },
                  ]}
                  onChange={(next) => {
                    draft.changed();
                    if (next === "custom")
                      setCustom({ start: periodStart, end: periodEnd });
                    setPeriod(next);
                  }}
                />
                {period !== "custom" && (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(periodStart, locale)} –{" "}
                    {formatDate(periodEnd, locale)}
                  </p>
                )}
              </div>
              {period === "custom" && (
                <>
                  <label className="field-label min-w-0">
                    {t("Từ ngày")}
                    <Input
                      className="h-[42px] @min-[40rem]:px-2"
                      type="date"
                      required
                      min="1900-01-01"
                      max="2100-12-31"
                      value={periodStart}
                      onChange={(e) =>
                        setCustom({ ...custom, start: e.target.value })
                      }
                    />
                  </label>
                  <label className="field-label min-w-0">
                    {t("Đến ngày")}
                    <Input
                      className="h-[42px] @min-[40rem]:px-2"
                      type="date"
                      required
                      min={periodStart || "1900-01-01"}
                      max="2100-12-31"
                      value={periodEnd}
                      onChange={(e) =>
                        setCustom({ ...custom, end: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <label className="field-label min-w-0">
                {t("Ngày đến hạn")}
                <Input
                  className="h-[42px] @min-[40rem]:px-2"
                  type="date"
                  required
                  min="1900-01-01"
                  max="2100-12-31"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-semibold">{t("Buổi đủ điều kiện")}</h2>
              {!!items?.length && (
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={allSelected}
                    ref={(input) => {
                      if (input)
                        input.indeterminate =
                          selected.length > 0 && !allSelected;
                    }}
                    disabled={items.length > MAX_STATEMENT_SESSIONS}
                    onChange={(e) => {
                      draft.changed();
                      setSelection(
                        e.target.checked
                          ? new Set(items.map((lesson) => lesson.id))
                          : new Set(),
                      );
                    }}
                  />
                  {t("Chọn tất cả buổi")}
                </label>
              )}
            </div>
            {items && items.length > MAX_STATEMENT_SESSIONS && (
              <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                {t(
                  "Mỗi bảng kê tối đa 100 buổi. Hãy chia thành nhiều bảng kê.",
                )}
              </p>
            )}
            {error ? (
              <div
                role="alert"
                className="space-y-2 p-4 text-sm text-destructive"
              >
                <p>{t(error)}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t("Tải lại danh sách")}
                </Button>
              </div>
            ) : items?.length ? (
              <div className="divide-y divide-border">
                {items.map((lesson) => (
                  <label
                    key={lesson.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={selection.has(lesson.id)}
                      disabled={
                        !selection.has(lesson.id) &&
                        selected.length >= MAX_STATEMENT_SESSIONS
                      }
                      onChange={(e) => {
                        const next = new Set(selected.map((item) => item.id));
                        if (e.target.checked) next.add(lesson.id);
                        else next.delete(lesson.id);
                        setSelection(next);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      {t("Buổi ")}
                      {formatDate(lesson.sessionDate, locale)}
                      {lesson.startTime && ` · ${lesson.startTime}`}
                    </span>
                    <strong>{formatVnd(lesson.amountVnd, locale)}</strong>
                  </label>
                ))}
              </div>
            ) : (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                {!endpoint
                  ? t("Chọn học viên và khoảng ngày hợp lệ để xem các buổi.")
                  : !items
                    ? t("Đang tìm buổi dạy…")
                    : t("Không có buổi đủ điều kiện trong khoảng này.")}
              </p>
            )}
          </Card>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm">
              {t("Tổng học phí")}{" "}
              <strong data-testid="statement-selection-total">
                {formatVnd(total, locale)}
              </strong>
            </p>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                {t("Quay lại bản xem trước")}
              </Button>
            )}
            <Button type="submit" disabled={!items || total <= 0}>
              {mutation.busy
                ? t("Đang lưu…")
                : issued
                  ? t("Lưu thay đổi bảng kê")
                  : initial
                    ? t("Phát hành bảng kê")
                    : t("Lập bảng kê")}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
