"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  formatVnd,
  statusLabels,
  vietnamToday,
} from "@/domain";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { RecordForm } from "./record-form";
import { StudentPicker } from "@/features/statements/shared";
import { useDebounced } from "@/lib/use-debounced";
import { GettingStartedCard } from "@/features/onboarding/guide";
import type { OnboardingState } from "@/domain/onboarding";
type Page<T> = { items: T[]; nextCursor: string | null };
type Summary = {
  activeStudents: number;
  outstandingVnd: number;
  overdueVnd: number;
  receivedMonthVnd: number;
  unbilledCount: number;
  unbilledVnd: number;
};
type Mode = "overview" | "students" | "sessions";
export function Workspace({
  mode,
  studentId,
  initialBilling = "all",
}: {
  mode: Mode;
  studentId?: string;
  initialBilling?: string;
}) {
  const [revision, setRevision] = useState(0);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const queryText = useDebounced(search);
  const initialRange = {
    from: "",
    to: "",
    studentId: "",
    status: "all",
    billing: initialBilling,
  };
  const [range, setRange] = useState(initialRange);
  const [draftRange, setDraftRange] = useState(initialRange);
  const applyRange = (next: typeof range) => {
    setDraftRange(next);
    setRange(next);
  };
  const [data, setData] = useState<{
    key: string;
    students: Page<Student>;
    sessions: Page<TeachingSession>;
    summary: Summary | null;
    onboarding: OnboardingState | null;
    student: Student | null;
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [modal, setModal] = useState<{
    kind: "student" | "session";
    record?: Student | TeachingSession;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const params = new URLSearchParams();
  if (mode === "students") {
    params.set("archived", String(archived));
    if (queryText.trim()) params.set("q", queryText.trim());
  } else {
    if (studentId || range.studentId)
      params.set("studentId", studentId || range.studentId);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (range.status !== "all") params.set("status", range.status);
    if (range.billing !== "all") params.set("billing", range.billing);
  }
  const endpoint =
    mode === "students" ? `/api/students?${params}` : `/api/sessions?${params}`;
  const key = `${endpoint}:${revision}:${mode}:${studentId ?? ""}`;
  useEffect(() => {
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
            students: mode === "students" ? (page as Page<Student>) : empty,
            sessions:
              mode !== "students" ? (page as Page<TeachingSession>) : empty,
            summary,
            onboarding,
            student,
          });
      })
      .catch((e) => {
        if (active) setError({ key, message: e.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, mode, studentId]);
  const loading =
    (mode === "students" && search !== queryText) ||
    (data?.key !== key && error?.key !== key);
  async function more() {
    const page = mode === "students" ? data?.students : data?.sessions;
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Student> | Page<TeachingSession>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((d) =>
        d?.key === key
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
      setNotice(e instanceof Error ? e.message : "Chưa thể tải thêm.");
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
          ? "Đã khôi phục học viên."
          : "Đã lưu trữ học viên. Các buổi cũ được giữ nguyên.",
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Chưa thể lưu thay đổi.");
    } finally {
      setActionBusy("");
    }
  }
  const view = data?.key === key ? data : null;
  const student = view?.student;
  const title =
    mode === "overview"
      ? "Một ngày dạy học thật tốt."
      : mode === "students"
        ? "Học viên của bạn"
        : (student?.displayName ?? "Sổ buổi dạy");
  return (
    <div className="fade-in">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
            {mode === "overview"
              ? `HÔM NAY · ${vietnamToday().split("-").reverse().join(" / ")}`
              : "SỔ BUỔI DẠY & HỌC PHÍ"}
          </p>
          <h1 className="serif text-3xl leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {mode === "overview"
              ? "Mỗi buổi được ghi lại, cuối tháng bớt một điều phải nhớ."
              : mode === "students"
                ? "Giữ thông tin và đơn giá. Lịch sử buổi dạy luôn còn trong sổ."
                : student
                  ? `Đơn giá hiện tại: ${formatVnd(student.defaultRateVnd)} / buổi${student.archivedAt ? " · Đã lưu trữ" : ""}`
                  : "Ghi từng buổi, theo dõi đúng học phí."}
          </p>
        </div>
        <Button
          disabled={
            Boolean(studentId) && (loading || !student || !!student.archivedAt)
          }
          onClick={() =>
            setModal({ kind: mode === "students" ? "student" : "session" })
          }
        >
          <Plus />
          {mode === "students" ? "Thêm học viên" : "Ghi buổi dạy"}
        </Button>
      </div>
      {mode === "sessions" && !studentId && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/app/lessons/new">Ghi buổi nhóm/lớp</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/app/lessons">Xem buổi nhóm & lớp</Link>
          </Button>
          <p className="w-full text-xs leading-5 text-muted-foreground">
            Danh sách bên dưới theo từng học viên. Một buổi nhóm có nhiều dòng
            học phí; mỗi người chỉ tính một lần trong bảng kê riêng.
          </p>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-accent-soft px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2">
            <Check size={16} />
            {notice}
          </span>
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {mode === "overview" && (
        <>
          <GettingStartedCard state={view?.onboarding ?? null} />
          <p className="mb-4 text-xs text-muted-foreground">
            <span>Học viên đang học</span>:{" "}
            {view?.summary?.activeStudents ?? "…"}. Buổi chưa lập bảng kê chưa
            được cộng vào khoản phải thu.
          </p>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Còn phải thu",
                value: view?.summary
                  ? formatVnd(view.summary.outstandingVnd)
                  : undefined,
                unit: "Mọi bảng kê đã phát hành còn thiếu",
                icon: NotebookPen,
                href: "/app/statements?status=outstanding",
              },
              {
                label: "Đã quá hạn",
                value: view?.summary
                  ? formatVnd(view.summary.overdueVnd)
                  : undefined,
                unit: "Phần còn thiếu sau ngày đến hạn",
                icon: CalendarDays,
                href: "/app/statements?status=overdue",
              },
              {
                label: "Buổi chưa lập bảng kê",
                value: view?.summary?.unbilledCount,
                unit: view?.summary
                  ? `${formatVnd(view.summary.unbilledVnd)} · Theo lượt học viên`
                  : "Buổi hoàn thành có tính phí",
                icon: CalendarDays,
                href: "/app/sessions?billing=unbilled",
              },
              {
                label: "Đã thu trong tháng",
                value: view?.summary
                  ? formatVnd(view.summary.receivedMonthVnd)
                  : undefined,
                unit: "Theo ngày nhận tiền tại Việt Nam",
                icon: NotebookPen,
              },
            ].map(({ label, value, unit, icon: Icon, href }, i) => (
              <Card
                data-tone={["yellow", "pink", "blue", "mint"][i]}
                key={label}
                className={`p-5 ${i === 2 ? "bg-accent-soft border-border" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {href ? (
                      <Link
                        href={href}
                        className="underline decoration-[#c3cfb4] underline-offset-4"
                      >
                        {label}
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
              Học phí tham khảo gồm buổi hoàn thành có tính phí chưa lập bảng
              kê. Sổ bắt đầu từ những buổi bạn nhập, chưa bao gồm nợ cũ. Bảng kê
              chốt các buổi cần thu. Khi nhận tiền, mở bảng kê để ghi nhận khoản
              thu.
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
            Sửa học viên
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!!actionBusy}
            onClick={() => archive(student)}
          >
            {student.archivedAt ? "Khôi phục" : "Lưu trữ học viên"}
          </Button>
          <Link href="/app/students" className="ml-auto text-xs text-primary">
            Tất cả học viên <ArrowRight size={13} className="inline" />
          </Link>
          <Link
            href={`/app/statements?studentId=${student.id}`}
            className="text-xs text-primary"
          >
            Bảng kê của học viên
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/statements/new?studentId=${student.id}`}>
              Lập bảng kê
            </Link>
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">
              {mode === "overview"
                ? "Những buổi gần đây"
                : mode === "students"
                  ? "Danh sách học viên"
                  : "Danh sách buổi dạy"}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {mode === "students"
                ? "Chạm vào tên để mở sổ của học viên"
                : "Đơn giá riêng được giữ cho từng buổi"}
            </p>
          </div>
          {mode === "students" ? (
            <select
              aria-label="Trạng thái học viên"
              className="select-input !w-auto !py-2 !text-xs"
              value={String(archived)}
              onChange={(e) => setArchived(e.target.value === "true")}
            >
              <option value="false">Đang học</option>
              <option value="true">Đã lưu trữ</option>
            </select>
          ) : mode === "overview" ? (
            <Link
              href="/app/sessions"
              className="flex items-center gap-2 text-xs text-primary"
            >
              Xem tất cả <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
        {mode === "students" && (
          <div className="border-b border-border p-4">
            <label className="field-label min-w-0">
              Tìm học viên
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
                placeholder="Nhập tên, có dấu hoặc không dấu"
              />
            </label>
          </div>
        )}
        {mode === "sessions" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setRange(draftRange);
            }}
            className="grid grid-cols-2 items-end gap-3 border-b border-border bg-surface p-4"
          >
            <label className="field-label min-w-0">
              Từ ngày
              <Input
                name="from"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={draftRange.from}
                onChange={(event) =>
                  setDraftRange({ ...draftRange, from: event.target.value })
                }
              />
            </label>
            <label className="field-label min-w-0">
              Đến ngày
              <Input
                name="to"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={draftRange.to}
                onChange={(event) =>
                  setDraftRange({ ...draftRange, to: event.target.value })
                }
              />
            </label>
            {!studentId && (
              <div className="col-span-2 min-w-0">
                <StudentPicker
                  value={draftRange.studentId}
                  onChange={(value) =>
                    setDraftRange({ ...draftRange, studentId: value })
                  }
                  optional
                />
              </div>
            )}
            <label className="field-label min-w-0">
              Trạng thái buổi
              <select
                className="select-input"
                value={draftRange.status}
                onChange={(event) =>
                  setDraftRange({ ...draftRange, status: event.target.value })
                }
              >
                <option value="all">Tất cả</option>
                <option value="planned">Dự kiến</option>
                <option value="completed">Đã dạy</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </label>
            <label className="field-label min-w-0">
              Học phí
              <select
                className="select-input"
                value={draftRange.billing}
                onChange={(event) =>
                  setDraftRange({ ...draftRange, billing: event.target.value })
                }
              >
                <option value="all">Tất cả</option>
                <option value="unbilled">Chưa lập bảng kê</option>
                <option value="billed">Đã lập bảng kê</option>
                <option value="free">Buổi miễn phí</option>
              </select>
            </label>
            <div className="col-span-2 flex flex-wrap gap-2">
              <Button variant="outline" type="submit">
                Lọc buổi dạy
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  const today = vietnamToday();
                  applyRange({ ...draftRange, from: today, to: today });
                }}
              >
                Hôm nay
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  const today = vietnamToday();
                  const [year, month] = today.split("-").map(Number);
                  const last = new Date(Date.UTC(year, month, 0))
                    .toISOString()
                    .slice(0, 10);
                  applyRange({
                    ...draftRange,
                    from: today.slice(0, 8) + "01",
                    to: last,
                  });
                }}
              >
                Tháng này
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => applyRange({ ...initialRange, billing: "all" })}
              >
                Xóa bộ lọc
              </Button>
            </div>
          </form>
        )}
        {loading ? (
          <div
            role="status"
            className="flex justify-center gap-2 p-14 text-sm text-muted-foreground"
          >
            <LoaderCircle size={18} className="animate-spin" />
            Đang mở sổ…
          </div>
        ) : error?.key === key ? (
          <div role="alert" className="p-8 text-center">
            <p className="mb-4 text-sm text-destructive">{error.message}</p>
            <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
              Thử lại
            </Button>
          </div>
        ) : mode === "students" ? (
          view?.students.items.length ? (
            <div className="divide-y divide-border">
              {view.students.items.map((s) => (
                <div
                  key={s.id}
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
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatVnd(s.defaultRateVnd)} / buổi
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ kind: "student", record: s })}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!actionBusy}
                    onClick={() => archive(s)}
                  >
                    {actionBusy === s.id
                      ? "Đang lưu…"
                      : s.archivedAt
                        ? "Khôi phục"
                        : "Lưu trữ"}
                  </Button>
                </div>
              ))}
            </div>
          ) : search.trim() ? (
            <div className="p-8 text-center text-sm" role="status">
              {view?.students.nextCursor
                ? "Chưa thấy học viên phù hợp. Bạn có thể tìm tiếp trong danh sách."
                : "Không tìm thấy học viên phù hợp."}
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
                className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
              >
                <div className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-border bg-surface py-1.5">
                  <span className="text-[9px] text-muted-foreground">
                    THÁNG {s.sessionDate.slice(5, 7)}
                  </span>
                  <span className="text-lg font-semibold leading-6">
                    {s.sessionDate.slice(8)}
                  </span>
                </div>
                <div className="min-w-0 basis-[calc(100%_-_4rem)] flex-1 sm:basis-40">
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
                      {s.className ? `Lớp ${s.className}` : "Buổi nhóm tự chọn"}
                    </Link>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.sessionDate.split("-").reverse().join("/")}
                    {s.startTime ? ` · ${s.startTime}` : ""}
                    {s.durationMinutes ? ` · ${s.durationMinutes} phút` : ""}
                  </p>
                </div>
                <span className={`status status-${s.status}`}>
                  {statusLabels[s.status]}
                </span>
                <div className="ml-auto min-w-24 text-right">
                  <p className="text-sm font-semibold">
                    {s.status === "completed" && s.billable
                      ? formatVnd(s.amountVnd)
                      : !s.billable
                        ? "Miễn phí"
                        : formatVnd(s.rateVnd)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {s.status === "planned" && s.billable
                      ? "Dự kiến"
                      : s.billedStatementId
                        ? "Đã lập bảng kê"
                        : s.billable && s.status === "completed"
                          ? "Chưa lập bảng kê"
                          : "Không tính phí"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={s.billedStatementId !== null}
                  onClick={() => setModal({ kind: "session", record: s })}
                >
                  Sửa
                </Button>
              </div>
            ))}
          </div>
        ) : range.from ||
          range.to ||
          range.studentId ||
          range.status !== "all" ||
          range.billing !== "all" ? (
          <div className="p-8 text-center text-sm" role="status">
            {view?.sessions.nextCursor
              ? "Chưa thấy buổi phù hợp. Bạn có thể tải tiếp danh sách."
              : "Không có buổi phù hợp với bộ lọc."}
          </div>
        ) : (
          <Empty kind="session" onAdd={() => setModal({ kind: "session" })} />
        )}
        {!loading &&
          (mode === "students"
            ? view?.students.nextCursor
            : view?.sessions.nextCursor) && (
            <div className="border-t border-border p-4 text-center">
              <Button variant="ghost" disabled={moreBusy} onClick={more}>
                <ChevronDown />
                {moreBusy
                  ? "Đang tải…"
                  : mode === "students" && search.trim()
                    ? "Tìm tiếp"
                    : "Tải thêm"}
              </Button>
            </div>
          )}
      </Card>
      {mode === "overview" && (
        <div className="mt-7 flex items-center gap-3 text-xs text-muted-foreground">
          <Leaf size={16} className="text-muted-foreground" />
          Một cuốn sổ gọn gàng, để bạn yên tâm đứng lớp.
        </div>
      )}
      {modal && (
        <RecordForm
          kind={modal.kind}
          record={modal.record}
          student={student ?? undefined}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setNotice(message);
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
            ? "Chưa có học viên lưu trữ"
            : "Bắt đầu với học viên đầu tiên"
          : "Chưa có buổi dạy trong sổ"}
      </h3>
      <p className="mb-6 mt-3 max-w-sm text-xs leading-6 text-muted-foreground">
        {kind === "student"
          ? "Thêm tên và đơn giá mỗi buổi. Bạn có thể thay đổi đơn giá sau."
          : "Thêm học viên, rồi ghi một buổi đã dạy. Học phí sẽ được lưu đúng theo buổi đó."}
      </p>
      {!archived && (
        <Button variant="outline" onClick={onAdd}>
          <Plus />
          {kind === "student" ? "Thêm học viên" : "Ghi buổi đầu tiên"}
        </Button>
      )}
    </div>
  );
}
