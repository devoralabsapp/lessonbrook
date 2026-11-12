"use client";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import Link from "@/components/workspace-link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Leaf,
  LoaderCircle,
  NotebookPen,
  Plus,
  Users,
} from "lucide-react";
import {
  type Student,
  type TeachingSession,
  dateSchema,
  formatVnd,
  statusLabels,
  vietnamToday,
} from "@/domain";
import {
  matchesSession,
  normalizeSearch,
  sessionTypeLabels,
} from "@/domain/list-filters";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { RecordForm } from "./record-form";
import { StudentPicker } from "@/features/statements/shared";
import { LessonTargetPicker } from "@/features/classes/lesson-target-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useDebounced } from "@/lib/use-debounced";
import { GettingStartedCard } from "@/features/onboarding/guide";
import type { OnboardingState } from "@/domain/onboarding";
type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
type Summary = {
  activeStudents: number;
  outstandingVnd: number;
  overdueVnd: number;
  receivedMonthVnd: number;
  unbilledCount: number;
  unbilledVnd: number;
};
type Mode = "overview" | "students" | "sessions";
const monthLabels = {
  en: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }),
  vi: new Intl.DateTimeFormat("vi-VN", { month: "short", timeZone: "UTC" }),
};
const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
function updatePage<T extends { id: string }>(
  page: Page<T>,
  record: T,
  matches: boolean,
  order: (a: T, b: T) => number,
): Page<T> {
  const items = page.items.filter((item) => item.id !== record.id);
  const last = page.items.at(-1);
  // If the row falls outside the loaded range, the next read will place it.
  if (matches && (!page.nextCursor || !last || order(record, last) <= 0))
    items.push(record);
  return { ...page, items: items.sort(order) };
}
export function Workspace({
  mode,
  studentId,
  initialBilling = "all",
}: {
  mode: Mode;
  studentId?: string;
  initialBilling?: string;
}) {
  const { t, locale } = useI18n();
  const [revision, setRevision] = useState(0);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState("student");
  const queryText = useDebounced(search);
  const initialRange = {
    from: "",
    to: "",
    studentId: "",
    target: "",
    status: "all",
    type: "all",
    billing: initialBilling,
  };
  const [range, setRange] = useState(initialRange);
  const invalidRange =
    (range.from !== "" && !dateSchema.safeParse(range.from).success) ||
    (range.to !== "" && !dateSchema.safeParse(range.to).success) ||
    (range.from !== "" && range.to !== "" && range.from > range.to);
  const [data, setData] = useState<{
    key: string;
    revision: number;
    students: Page<Student>;
    sessions: Page<TeachingSession>;
    summary: Summary | null;
    onboarding: OnboardingState | null;
    student: Student | null;
  } | null>(null);
  const [error, setError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [modal, setModal] = useState<{
    kind: "student" | "session";
    record?: Student | TeachingSession;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const params = new URLSearchParams();
  const [targetKind, targetId] = range.target.split(":");
  if (mode === "students") {
    params.set("archived", String(archived));
    if (queryText.trim()) params.set("q", queryText.trim());
  } else {
    if (studentId || range.studentId)
      params.set("studentId", studentId || range.studentId);
    if (targetId)
      params.set(targetKind === "class" ? "classId" : "lessonId", targetId);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (range.status !== "all") params.set("status", range.status);
    if (range.type !== "all") params.set("type", range.type);
    if (range.billing !== "all") params.set("billing", range.billing);
  }
  const endpoint =
    mode === "students" ? `/api/students?${params}` : `/api/sessions?${params}`;
  const key = `${endpoint}:${mode}:${studentId ?? ""}`;
  const requestKey = `${key}:${revision}`;
  useEffect(() => {
    if (mode === "students") return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("class-lessons-created", refresh);
    return () => window.removeEventListener("class-lessons-created", refresh);
  }, [mode]);
  useEffect(() => {
    if (invalidRange) return;
    let active = true;
    const empty = { items: [], nextCursor: null };
    Promise.all([
      api<Page<Student> | Page<TeachingSession>>(endpoint),
      mode === "overview"
        ? api<Summary>("/api/summary")
        : Promise.resolve(null),
      mode === "overview"
        ? api<OnboardingState>("/api/onboarding")
        : Promise.resolve(null),
      studentId
        ? api<Student>(`/api/students/${studentId}`)
        : Promise.resolve(null),
    ])
      .then(([page, summary, onboarding, student]) => {
        if (active)
          setData({
            key,
            revision,
            students: mode === "students" ? (page as Page<Student>) : empty,
            sessions:
              mode !== "students" ? (page as Page<TeachingSession>) : empty,
            summary,
            onboarding,
            student,
          });
      })
      .catch((e) => {
        if (active) setError({ key: requestKey, message: e.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, invalidRange, key, mode, requestKey, revision, studentId, t]);
  const view = data?.key === key ? data : null;
  const loadError = error?.key === requestKey ? error.message : "";
  const loading =
    !invalidRange &&
    ((mode === "students" && search !== queryText) || (!view && !loadError));
  const updating = !!view && view.revision !== revision && !loadError;
  async function more() {
    const page = mode === "students" ? view?.students : view?.sessions;
    if (!page?.nextCursor || updating || moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Student> | Page<TeachingSession>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((d) =>
        d && d === view
          ? {
              ...d,
              ...(mode === "students"
                ? {
                    students: {
                      items: [
                        ...d.students.items,
                        ...(next.items as Student[]),
                      ],
                      nextCursor: next.nextCursor,
                    },
                  }
                : {
                    sessions: {
                      items: [
                        ...d.sessions.items,
                        ...(next.items as TeachingSession[]),
                      ],
                      nextCursor: next.nextCursor,
                    },
                  }),
            }
          : d,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("Chưa thể tải thêm."));
    } finally {
      setMoreBusy(false);
    }
  }
  async function archive(student: Student) {
    setActionBusy(student.id);
    try {
      await api(`/api/students/${student.id}/archive`, {
        method: "POST",
        body: { archived: !student.archivedAt },
        requestId: crypto.randomUUID(),
      });
      setNotice(
        student.archivedAt
          ? t("Đã khôi phục học viên.")
          : t("Đã lưu trữ học viên. Các buổi cũ được giữ nguyên."),
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("Chưa thể lưu thay đổi."));
    } finally {
      setActionBusy("");
    }
  }
  const student = view?.student;
  function applySaved(record: Student | TeachingSession) {
    setData((current) => {
      if (!current || current.key !== key) return current;
      if ("sessionDate" in record) {
        const selectedStudent = studentId || range.studentId;
        const matches =
          (!selectedStudent || selectedStudent === record.studentId) &&
          (!targetId ||
            targetId ===
              (targetKind === "class" ? record.classId : record.lessonId)) &&
          (!range.from || record.sessionDate >= range.from) &&
          (!range.to || record.sessionDate <= range.to) &&
          matchesSession(record, range.status, range.billing, range.type);
        return {
          ...current,
          sessions: updatePage(
            current.sessions,
            record,
            matches,
            (a, b) =>
              compare(b.sessionDate, a.sessionDate) || compare(b.id, a.id),
          ),
        };
      }
      if (mode !== "students") return { ...current, student: record };
      const matches =
        Boolean(record.archivedAt) === archived &&
        normalizeSearch(record.displayName).includes(
          normalizeSearch(queryText),
        );
      return {
        ...current,
        students: updatePage(current.students, record, matches, (a, b) =>
          archived
            ? compare(b.archivedAt ?? "", a.archivedAt ?? "") ||
              compare(b.id, a.id)
            : compare(a.displayName, b.displayName) || compare(a.id, b.id),
        ),
      };
    });
  }
  const title =
    mode === "overview"
      ? t("Một ngày dạy học thật tốt.")
      : mode === "students"
        ? t("Học viên của bạn")
        : (student?.displayName ?? t("Sổ buổi dạy"));
  return (
    <div className="fade-in">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
            {mode === "overview"
              ? t("HÔM NAY · {0}", {
                  "0": formatDate(vietnamToday(), locale),
                })
              : t("SỔ BUỔI DẠY & HỌC PHÍ")}
          </p>
          <h1 className="serif text-3xl leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {mode === "overview"
              ? t("Mỗi buổi được ghi lại, cuối tháng bớt một điều phải nhớ.")
              : mode === "students"
                ? t(
                    "Giữ thông tin và đơn giá. Lịch sử buổi dạy luôn còn trong sổ.",
                  )
                : student
                  ? t("Đơn giá hiện tại: {0} / buổi{1}", {
                      "0": formatVnd(student.defaultRateVnd, locale),
                      "1": student.archivedAt ? t(" · Đã lưu trữ") : "",
                    })
                  : t("Ghi từng buổi, theo dõi đúng học phí.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!studentId && mode !== "students" && (
            <Button asChild variant="outline">
              <Link href="/app/schedule">
                <CalendarDays />
                {t("Lịch dạy sắp tới")}
              </Link>
            </Button>
          )}
          <Button
            disabled={
              Boolean(studentId) &&
              (loading || !student || !!student.archivedAt)
            }
            onClick={() =>
              setModal({ kind: mode === "students" ? "student" : "session" })
            }
          >
            <Plus />
            {mode === "students" ? t("Thêm học viên") : t("Ghi buổi dạy")}
          </Button>
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-accent-soft px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2">
            <Check size={16} />
            {notice}
          </span>
          <button
            aria-label={t("Đóng thông báo")}
            onClick={() => setNotice("")}
          >
            {t("×")}
          </button>
        </div>
      )}
      {mode === "overview" && (
        <>
          <GettingStartedCard state={view?.onboarding ?? null} />
          <p className="mb-4 text-xs text-muted-foreground">
            <span>{t("Học viên đang học")}</span>:{" "}
            {view?.summary?.activeStudents ?? "…"}
            {t(". Buổi chưa lập bảng kê chưa được cộng vào khoản phải thu.")}
          </p>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: t("Còn phải thu"),
                value: view?.summary
                  ? formatVnd(view.summary.outstandingVnd, locale)
                  : undefined,
                unit: t("Mọi bảng kê đã phát hành còn thiếu"),
                icon: NotebookPen,
                href: "/app/statements?status=outstanding",
              },
              {
                label: t("Đã quá hạn"),
                value: view?.summary
                  ? formatVnd(view.summary.overdueVnd, locale)
                  : undefined,
                unit: t("Phần còn thiếu sau ngày đến hạn"),
                icon: CalendarDays,
                href: "/app/statements?status=overdue",
              },
              {
                label: t("Buổi chưa lập bảng kê"),
                value: view?.summary?.unbilledCount,
                unit: view?.summary
                  ? t("{0} · Theo lượt học viên", {
                      "0": formatVnd(view.summary.unbilledVnd, locale),
                    })
                  : t("Buổi hoàn thành có tính phí"),
                icon: CalendarDays,
                href: "/app/sessions?billing=unbilled",
              },
              {
                label: t("Đã thu trong tháng"),
                value: view?.summary
                  ? formatVnd(view.summary.receivedMonthVnd, locale)
                  : undefined,
                unit: t("Theo ngày nhận tiền tại Việt Nam"),
                icon: NotebookPen,
              },
            ].map(({ label, value, unit, icon: Icon, href }, i) => (
              <Card
                data-tone={["yellow", "pink", "blue", "mint"][i]}
                key={t(label)}
                className={`p-5 ${i === 2 ? "bg-accent-soft border-border" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {href ? (
                      <Link
                        href={href}
                        className="underline decoration-[#c3cfb4] underline-offset-4"
                      >
                        {t(label)}
                      </Link>
                    ) : (
                      label
                    )}
                  </p>
                  <Icon size={17} className="text-muted-foreground" />
                </div>
                <p className="mt-5 text-[29px] font-semibold tracking-tight">
                  {loading ? "…" : (value ?? "—")}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">{unit}</p>
              </Card>
            ))}
          </div>
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-dashed border-border px-4 py-3">
            <CircleHelp
              size={16}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                "Học phí tham khảo gồm buổi hoàn thành có tính phí chưa lập bảng kê. Sổ bắt đầu từ những buổi bạn nhập, chưa bao gồm nợ cũ. Bảng kê chốt các buổi cần thu. Khi nhận tiền, mở bảng kê để ghi nhận khoản thu.",
              )}
            </p>
          </div>
        </>
      )}
      {student && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModal({ kind: "student", record: student })}
          >
            {t("Sửa học viên")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!!actionBusy}
            onClick={() => archive(student)}
          >
            {student.archivedAt ? t("Khôi phục") : t("Lưu trữ học viên")}
          </Button>
          <Link href="/app/students" className="ml-auto text-xs text-primary">
            {t("Tất cả học viên ")}
            <ArrowRight size={13} className="inline" />
          </Link>
          <Link
            href={`/app/statements?studentId=${student.id}`}
            className="text-xs text-primary"
          >
            {t("Bảng kê của học viên")}
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/statements/new?studentId=${student.id}`}>
              {t("Lập bảng kê")}
            </Link>
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 sm:px-6 ${mode === "sessions" ? "py-3" : "py-5"}`}
        >
          <div>
            <h2 className="text-sm font-semibold">
              {mode === "overview"
                ? t("Những buổi gần đây")
                : mode === "students"
                  ? t("Danh sách học viên")
                  : t("Danh sách buổi dạy")}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {mode === "students"
                ? t("Chạm vào tên để mở sổ của học viên")
                : t("Đơn giá riêng được giữ cho từng buổi")}
            </p>
          </div>
          {mode === "students" ? (
            <ThemedSelect
              label={t("Trạng thái học viên")}
              toolbar
              value={String(archived)}
              onChange={(value) => setArchived(value === "true")}
              options={[
                { value: "false", label: t("Đang học") },
                { value: "true", label: t("Đã lưu trữ") },
              ]}
            />
          ) : mode === "overview" ? (
            <Link
              href="/app/sessions"
              className="flex items-center gap-2 text-xs text-primary"
            >
              {t("Xem tất cả ")}
              <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
        {mode === "students" && (
          <div className="border-b border-border p-4">
            <label className="field-label min-w-0">
              {t("Tìm học viên")}
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
                placeholder={t("Nhập tên, có dấu hoặc không dấu")}
              />
            </label>
          </div>
        )}
        {mode === "sessions" && (
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2.5 border-b border-border bg-surface p-3 sm:grid-cols-4 sm:px-5">
            <label className="field-label col-span-2 min-w-0 min-[420px]:col-span-1">
              {t("Từ ngày")}
              <Input
                className="h-[42px]"
                name="from"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={range.from}
                onChange={(event) =>
                  setRange({ ...range, from: event.target.value })
                }
              />
            </label>
            <label className="field-label col-span-2 min-w-0 min-[420px]:col-span-1">
              {t("Đến ngày")}
              <Input
                className="h-[42px]"
                name="to"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={range.to}
                onChange={(event) =>
                  setRange({ ...range, to: event.target.value })
                }
              />
            </label>
            {!studentId && (
              <div className="col-span-2 grid min-w-0 items-start gap-x-3 gap-y-2.5 sm:grid-cols-2">
                <label className="field-label">
                  {t("Tìm theo")}
                  <ThemedSelect
                    label={t("Tìm theo")}
                    value={searchBy}
                    onChange={(next) => {
                      setSearchBy(next);
                      setRange((current) => ({
                        ...current,
                        studentId: "",
                        target: "",
                        type: next === "group-class" ? "shared" : "all",
                      }));
                    }}
                    options={[
                      { value: "student", label: t("Tìm theo học viên") },
                      { value: "group-class", label: t("Tìm theo nhóm/lớp") },
                    ]}
                  />
                </label>
                {searchBy === "student" ? (
                  <StudentPicker
                    value={range.studentId}
                    onChange={(value) =>
                      setRange({ ...range, studentId: value })
                    }
                    optional
                    showSearch={false}
                  />
                ) : (
                  <LessonTargetPicker
                    value={range.target}
                    onChange={(value) => setRange({ ...range, target: value })}
                  />
                )}
              </div>
            )}
            <label
              className={`field-label min-w-0 ${searchBy === "group-class" ? "sm:col-span-2" : ""}`}
            >
              {t("Trạng thái buổi")}
              <ThemedSelect
                label={t("Trạng thái buổi")}
                value={range.status}
                onChange={(status) => setRange({ ...range, status })}
                options={[
                  { value: "all", label: t("Tất cả") },
                  { value: "planned", label: t("Dự kiến") },
                  { value: "completed", label: t("Đã dạy") },
                  { value: "cancelled", label: t("Đã hủy") },
                ]}
              />
            </label>
            <label
              className={`field-label min-w-0 ${searchBy === "group-class" ? "sm:col-span-2" : ""}`}
            >
              {t("Học phí")}
              <ThemedSelect
                label={t("Học phí")}
                value={range.billing}
                onChange={(billing) => setRange({ ...range, billing })}
                options={[
                  { value: "all", label: t("Tất cả") },
                  { value: "unbilled", label: t("Chưa lập bảng kê") },
                  { value: "billed", label: t("Đã lập bảng kê") },
                  { value: "free", label: t("Buổi miễn phí") },
                ]}
              />
            </label>
            {searchBy === "student" && (
              <label className="field-label col-span-2 min-w-0">
                {t("Loại buổi dạy")}
                <ThemedSelect
                  label={t("Loại buổi dạy")}
                  value={range.type}
                  onChange={(type) => setRange({ ...range, type })}
                  options={Object.entries(sessionTypeLabels).map(
                    ([value, label]) => ({
                      value,
                      label: t(label),
                    }),
                  )}
                />
              </label>
            )}
            {invalidRange && (
              <p
                role="alert"
                className="col-span-full text-sm text-destructive"
              >
                {t("Khoảng ngày không hợp lệ.")}
              </p>
            )}
            <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
              <Button
                variant="ghost"
                type="button"
                size="sm"
                onClick={() => {
                  const today = vietnamToday();
                  setRange({ ...range, from: today, to: today });
                }}
              >
                {t("Hôm nay")}
              </Button>
              <Button
                variant="ghost"
                type="button"
                size="sm"
                onClick={() => {
                  const today = vietnamToday();
                  const [year, month] = today.split("-").map(Number);
                  const last = new Date(Date.UTC(year, month, 0))
                    .toISOString()
                    .slice(0, 10);
                  setRange({
                    ...range,
                    from: today.slice(0, 8) + "01",
                    to: last,
                  });
                }}
              >
                {t("Tháng này")}
              </Button>
              <Button
                variant="ghost"
                type="button"
                size="sm"
                onClick={() => {
                  setSearchBy("student");
                  setRange({ ...initialRange, billing: "all" });
                }}
              >
                {t("Xóa bộ lọc")}
              </Button>
            </div>
          </div>
        )}
        {loadError && (
          <div role="alert" className="p-8 text-center">
            <p className="mb-4 text-sm text-destructive">{t(loadError)}</p>
            <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
              {t("Thử lại")}
            </Button>
          </div>
        )}
        {loading ? (
          <div
            role="status"
            className="flex justify-center gap-2 p-14 text-sm text-muted-foreground"
          >
            <LoaderCircle size={18} className="animate-spin" />
            {t("Đang mở sổ…")}
          </div>
        ) : !view ? null : mode === "students" ? (
          view?.students.items.length ? (
            <div className="divide-y divide-border">
              {view.students.items.map((s, index) => (
                <div
                  key={s.id}
                  data-list-tone={
                    s.archivedAt ? "neutral" : index % 2 ? "mint" : "blue"
                  }
                  className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-semibold text-primary">
                    {s.displayName[0]}
                  </span>
                  <Link
                    className="min-w-0 flex-1"
                    href={`/app/students/${s.id}`}
                  >
                    <span className="block break-words text-sm font-semibold">
                      {s.displayName}
                    </span>
                    {(s.contactName || s.phone) && (
                      <span className="mt-1 block break-words text-xs text-muted-foreground">
                        {[s.contactName, s.phone].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ kind: "student", record: s })}
                  >
                    {t("Sửa")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!actionBusy}
                    onClick={() => archive(s)}
                  >
                    {actionBusy === s.id
                      ? t("Đang lưu…")
                      : s.archivedAt
                        ? t("Khôi phục")
                        : t("Lưu trữ")}
                  </Button>
                </div>
              ))}
            </div>
          ) : search.trim() ? (
            <div className="p-8 text-center text-sm" role="status">
              {view?.students.nextCursor
                ? t(
                    "Chưa thấy học viên phù hợp. Bạn có thể tìm tiếp trong danh sách.",
                  )
                : t("Không tìm thấy học viên phù hợp.")}
            </div>
          ) : (
            <Empty
              kind="student"
              onAdd={() => setModal({ kind: "student" })}
              archived={archived}
            />
          )
        ) : view?.sessions.items.length ? (
          <div className="divide-y divide-border">
            {view.sessions.items.map((s) => (
              <div
                key={s.id}
                data-list-tone={
                  s.status === "completed"
                    ? "mint"
                    : s.status === "planned"
                      ? "yellow"
                      : "pink"
                }
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
              >
                <time
                  dateTime={s.sessionDate}
                  data-slot="lesson-date"
                  aria-hidden="true"
                  className="grid w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-accent-soft text-center text-foreground"
                >
                  <span className="lesson-date-month whitespace-nowrap bg-primary px-1 py-1 text-[10px] leading-4 font-bold uppercase text-primary-foreground">
                    {monthLabels[locale].format(
                      new Date(`${s.sessionDate}T00:00:00Z`),
                    )}
                  </span>
                  <span className="py-1 text-xl leading-6 font-extrabold tabular-nums">
                    {s.sessionDate.slice(8)}
                  </span>
                </time>
                <div className="min-w-0 basis-[calc(100%_-_4.75rem)] flex-1 sm:basis-40">
                  <Link
                    href={`/app/students/${s.studentId}`}
                    className="break-words text-sm font-semibold"
                  >
                    {s.studentName}
                  </Link>
                  {s.lessonId && (
                    <Link
                      href={`/app/lessons/${s.lessonId}`}
                      className="mt-1 block break-words text-[11px] text-primary underline"
                    >
                      {s.className
                        ? t("Lớp {0}", { "0": s.className })
                        : t("Buổi nhóm tự chọn")}
                    </Link>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(s.sessionDate, locale)}
                    {s.startTime ? ` · ${s.startTime}` : ""}
                    {s.durationMinutes
                      ? t(" · {0} phút", { "0": s.durationMinutes })
                      : ""}
                  </p>
                </div>
                <span className={`status status-${s.status}`}>
                  {t(statusLabels[s.status])}
                </span>
                <div className="ml-auto min-w-24 text-right">
                  <p className="text-sm font-semibold">
                    {s.status === "completed" && s.billable
                      ? formatVnd(s.amountVnd, locale)
                      : !s.billable
                        ? t("Miễn phí")
                        : formatVnd(s.rateVnd, locale)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {s.status === "planned" && s.billable
                      ? t("Dự kiến")
                      : s.billedStatementId
                        ? t("Đã lập bảng kê")
                        : s.billable && s.status === "completed"
                          ? t("Chưa lập bảng kê")
                          : t("Không tính phí")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={s.billedStatementId !== null}
                  onClick={() => setModal({ kind: "session", record: s })}
                >
                  {t("Sửa")}
                </Button>
              </div>
            ))}
          </div>
        ) : range.from ||
          range.to ||
          range.studentId ||
          range.target ||
          range.status !== "all" ||
          range.type !== "all" ||
          range.billing !== "all" ? (
          <div className="p-8 text-center text-sm" role="status">
            {view?.sessions.nextCursor
              ? t("Chưa thấy buổi phù hợp. Bạn có thể tải tiếp danh sách.")
              : t("Không có buổi phù hợp với bộ lọc.")}
          </div>
        ) : (
          <Empty kind="session" onAdd={() => setModal({ kind: "session" })} />
        )}
        {!loading &&
          (mode === "students"
            ? view?.students.nextCursor
            : view?.sessions.nextCursor) && (
            <div className="border-t border-border p-4 text-center">
              <Button
                variant="ghost"
                disabled={moreBusy || updating}
                onClick={more}
              >
                <ChevronDown />
                {moreBusy
                  ? t("Đang tải…")
                  : mode === "students" && search.trim()
                    ? t("Tìm tiếp")
                    : t("Tải thêm")}
              </Button>
            </div>
          )}
      </Card>
      {mode === "overview" && (
        <div className="mt-7 flex items-center gap-3 text-xs text-muted-foreground">
          <Leaf size={16} className="text-muted-foreground" />
          {t("Một cuốn sổ gọn gàng, để bạn yên tâm đứng lớp.")}
        </div>
      )}
      {modal && (
        <RecordForm
          kind={modal.kind}
          record={modal.record}
          student={student ?? undefined}
          onClose={() => setModal(null)}
          onSaved={(message, record) => {
            setModal(null);
            setNotice(message);
            if (record) applySaved(record);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
function Empty({
  kind,
  onAdd,
  archived = false,
}: {
  kind: "student" | "session";
  onAdd: () => void;
  archived?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-muted-foreground">
        {kind === "student" ? (
          <Users size={25} strokeWidth={1.5} />
        ) : (
          <NotebookPen size={25} strokeWidth={1.5} />
        )}
      </span>
      <h3 className="serif text-2xl">
        {kind === "student"
          ? archived
            ? t("Chưa có học viên lưu trữ")
            : t("Bắt đầu với học viên đầu tiên")
          : t("Chưa có buổi dạy trong sổ")}
      </h3>
      <p className="mb-6 mt-3 max-w-sm text-xs leading-6 text-muted-foreground">
        {kind === "student"
          ? t("Thêm tên và đơn giá mỗi buổi. Bạn có thể thay đổi đơn giá sau.")
          : t(
              "Thêm học viên, rồi ghi một buổi đã dạy. Học phí sẽ được lưu đúng theo buổi đó.",
            )}
      </p>
      {!archived && (
        <Button variant="outline" onClick={onAdd}>
          <Plus />
          {kind === "student" ? t("Thêm học viên") : t("Ghi buổi đầu tiên")}
        </Button>
      )}
    </div>
  );
}
