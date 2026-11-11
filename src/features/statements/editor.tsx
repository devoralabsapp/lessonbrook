"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import Link from "next/link";
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
  type Statement,
  type statementItemSchema,
} from "@/domain/statements";
import { type z } from "zod";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatDate,
  type Page,
  StudentPicker,
  useStatementMutation,
} from "./shared";
type Item = z.infer<typeof statementItemSchema>;
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
  const today = vietnamToday();
  const [studentId, setStudentId] = useState(
    initial?.studentId ?? initialStudentId,
  );
  const [periodStart, setPeriodStart] = useState(
    initial?.periodStart ?? today.slice(0, 7) + "-01",
  );
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? today);
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ?? addBusinessDays(today, 7),
  );
  const [includeBankDetails, setIncludeBankDetails] = useState(
    initial?.includeBankDetails ?? false,
  );
  const [selected, setSelected] = useState<Map<string, Item>>(
    () => new Map(initial?.items.map((item) => [item.sessionId, item]) ?? []),
  );
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    key: string;
    page: Page<TeachingSession>;
  } | null>(null);
  const [error, setError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const validRange =
    dateSchema.safeParse(periodStart).success &&
    dateSchema.safeParse(periodEnd).success &&
    periodStart <= periodEnd;
  const endpoint =
    studentId && validRange
      ? `/api/statements/eligible?${new URLSearchParams({ studentId, periodStart, periodEnd })}`
      : "";
  const key = `${endpoint}:${revision}`;
  const toItem = (session: TeachingSession): Item => ({
    sessionId: session.id,
    sessionDate: session.sessionDate,
    amountVnd: session.amountVnd,
  });
  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    api<Page<TeachingSession>>(endpoint)
      .then((page) => {
        if (!active) return;
        setData({ key, page });
        setSelected(
          (current) =>
            new Map(
              [...current].map(([id, item]) => {
                const fresh = page.items.find((session) => session.id === id);
                return [id, fresh ? toItem(fresh) : item];
              }),
            ),
        );
      })
      .catch((error) => {
        if (active) setError({ key, message: error.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  const page = data?.key === key ? data.page : null;
  const total = [...selected.values()].reduce(
    (sum, item) => sum + item.amountVnd,
    0,
  );
  function resetSelection() {
    setSelected(new Map());
  }
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<TeachingSession>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (session) =>
                      !current.page.items.some((old) => old.id === session.id),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
      setSelected(
        (current) =>
          new Map(
            [...current].map(([id, item]) => {
              const fresh = next.items.find((session) => session.id === id);
              return [id, fresh ? toItem(fresh) : item];
            }),
          ),
      );
    } catch (error) {
      setError({
        key,
        message:
          error instanceof Error ? error.message : t("Chưa tải được buổi dạy."),
      });
    } finally {
      setMoreBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutation.run(
      initial ? `/api/statements/${initial.id}` : "/api/statements",
      initial ? "PATCH" : "POST",
      {
        studentId,
        periodStart,
        periodEnd,
        dueDate,
        includeBankDetails,
        sessionIds: [...selected.keys()].sort(),
        ...(initial ? { version: initial.version } : {}),
      },
    );
    if (result) {
      draft.saved();
      if (onSaved) onSaved(result.id);
      else {
        router.push(`/app/statements/${result.id}`);
        router.refresh();
      }
    }
  }
  return (
    <div className="fade-in space-y-6">
      <div>
        <Link href="/app/statements" className="text-xs text-primary">
          {t("← Danh sách bảng kê")}
        </Link>
        <h1 className="serif mt-4 text-3xl">
          {initial ? t("Sửa bản nháp") : t("Lập bảng kê học phí")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            "Chọn buổi đã dạy, lưu nháp rồi kiểm tra bản xem trước để phát hành.",
          )}
        </p>
      </div>
      <form onSubmit={save} {...draft.form}>
        <fieldset disabled={mutation.busy} className="min-w-0 space-y-5">
          <Card className="space-y-5 p-5 sm:p-7">
            <StudentPicker
              value={studentId}
              onChange={(id) => {
                draft.changed();
                setStudentId(id);
                resetSelection();
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                {t("Từ ngày")}
                <Input
                  type="date"
                  required
                  min="1900-01-01"
                  max="2100-12-31"
                  value={periodStart}
                  onChange={(event) => {
                    setPeriodStart(event.target.value);
                    resetSelection();
                  }}
                />
              </label>
              <label className="field-label">
                {t("Đến ngày")}
                <Input
                  type="date"
                  required
                  min={periodStart || "1900-01-01"}
                  max="2100-12-31"
                  value={periodEnd}
                  onChange={(event) => {
                    setPeriodEnd(event.target.value);
                    resetSelection();
                  }}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Gồm cả ngày đầu và ngày cuối. Chỉ lấy buổi hoàn thành, tính phí và chưa thuộc bảng kê đã phát hành. Học viên lưu trữ vẫn lập được bảng kê cho buổi cũ.",
              )}
            </p>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <h2 className="font-semibold">{t("Buổi đủ điều kiện")}</h2>
              {page?.items.length ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    draft.changed();
                    setSelected((current) => {
                      const next = new Map(current);
                      for (const session of page.items) {
                        if (
                          next.size < MAX_STATEMENT_SESSIONS ||
                          next.has(session.id)
                        )
                          next.set(session.id, toItem(session));
                      }
                      return next;
                    });
                  }}
                >
                  {t("Chọn các buổi đang hiện")}
                </Button>
              ) : null}
            </div>
            {!endpoint ? (
              <p className="p-6 text-sm text-muted-foreground">
                {t("Chọn học viên và khoảng ngày hợp lệ để xem các buổi.")}
              </p>
            ) : error?.key === key ? (
              <div role="alert" className="p-5 text-sm text-destructive">
                {t(error.message)}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t("Tải lại danh sách")}
                </Button>
              </div>
            ) : !page ? (
              <p role="status" className="p-6 text-sm">
                {t("Đang tìm buổi dạy…")}
              </p>
            ) : page.items.length ? (
              <div className="divide-y divide-border">
                {page.items.map((session) => (
                  <label
                    key={session.id}
                    className="flex cursor-pointer items-center gap-3 px-5 py-4"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(session.id)}
                      disabled={
                        !selected.has(session.id) &&
                        selected.size >= MAX_STATEMENT_SESSIONS
                      }
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Map(current);
                          if (event.target.checked)
                            next.set(session.id, toItem(session));
                          else next.delete(session.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      {t("Buổi ")}
                      {formatDate(session.sessionDate, locale)}
                      {session.startTime ? ` · ${session.startTime}` : ""}
                    </span>
                    <span className="text-sm font-semibold">
                      {formatVnd(session.amountVnd, locale)}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {t(
                  "Không có buổi đủ điều kiện trong khoảng này. Buổi đã phát hành bảng kê sẽ không xuất hiện ở đây.",
                )}
              </p>
            )}
            {page?.nextCursor && (
              <div className="border-t border-border p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={more}
                  disabled={moreBusy}
                >
                  {moreBusy ? t("Đang tải…") : t("Tải thêm buổi")}
                </Button>
              </div>
            )}
          </Card>
          <Card className="space-y-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                {t("Đã chọn ")}
                {selected.size}
                {t("/100 buổi")}
              </h2>
              {selected.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    draft.changed();
                    resetSelection();
                  }}
                >
                  {t("Bỏ chọn tất cả")}
                </Button>
              )}
            </div>
            {selected.size > 0 && (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {[...selected.values()]
                  .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
                  .map((item, index) => (
                    <li
                      key={item.sessionId}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        {formatDate(item.sessionDate, locale)} ·{" "}
                        {formatVnd(item.amountVnd, locale)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("Bỏ buổi {0} số {1}", {
                          "0": formatDate(item.sessionDate, locale),
                          "1": index + 1,
                        })}
                        onClick={() => {
                          draft.changed();
                          setSelected((current) => {
                            const next = new Map(current);
                            next.delete(item.sessionId);
                            return next;
                          });
                        }}
                      >
                        {t("Bỏ chọn")}
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
            <p className="flex justify-between gap-2 text-sm">
              {t("Tổng bản nháp")}
              <strong data-testid="draft-total">
                {formatVnd(total, locale)}
              </strong>
            </p>
            <label className="field-label">
              {t("Ngày đến hạn")}
              <Input
                type="date"
                required
                min="1900-01-01"
                max="2100-12-31"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={includeBankDetails}
                onChange={(event) =>
                  setIncludeBankDetails(event.target.checked)
                }
              />
              <span>
                {t("Đưa thông tin nhận tiền từ hồ sơ vào bảng kê")}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("Bạn sẽ kiểm tra lại nội dung trước khi phát hành.")}
                </span>
              </span>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Nháp chưa tạo khoản phải thu và chưa khóa buổi dạy. Nếu buổi thay đổi, số tiền sẽ được tính lại khi lưu nháp.",
              )}
            </p>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={
                  mutation.busy ||
                  !studentId ||
                  !validRange ||
                  !selected.size ||
                  total <= 0
                }
              >
                {mutation.busy ? t("Đang lưu…") : t("Lưu nháp")}
              </Button>
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={mutation.busy}
                >
                  {t("Quay lại bản xem trước")}
                </Button>
              )}
            </div>
          </Card>
        </fieldset>
      </form>
    </div>
  );
}
