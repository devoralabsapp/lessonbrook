"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import {
  type Student,
  type TeachingSession,
  formatVnd,
  MAX_VND,
  sessionAmount,
  vietnamToday,
} from "@/domain";
import { useDebounced } from "@/lib/use-debounced";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Props = {
  kind: "student" | "session";
  record?: Student | TeachingSession;
  student?: Student;
  onClose: () => void;
  onSaved: (message: string) => void;
};
export function RecordForm({ kind, record, student, onClose, onSaved }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const s = kind === "student" ? (record as Student | undefined) : undefined;
  const lesson =
    kind === "session" ? (record as TeachingSession | undefined) : undefined;
  const [status, setStatus] = useState(lesson?.status ?? "completed");
  const [billable, setBillable] = useState(lesson?.billable ?? true);
  const [selected, setSelected] = useState(
    lesson?.studentId ?? (student?.archivedAt ? "" : student?.id) ?? "",
  );
  const [rate, setRate] = useState(
    lesson?.rateVnd ?? student?.defaultRateVnd ?? 200000,
  );
  const [date, setDate] = useState(lesson?.sessionDate ?? vietnamToday());
  const [time, setTime] = useState(lesson?.startTime ?? "");
  const [duplicate, setDuplicate] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const studentTerm = useDebounced(studentSearch);
  const studentEndpoint = `/api/students?${new URLSearchParams({ limit: "50", q: studentTerm })}`;
  const [students, setStudents] = useState<Student[]>(student ? [student] : []);
  const [cursor, setCursor] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState("");
  const studentGeneration = useRef(0);
  const [studentsBusy, setStudentsBusy] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    const trigger = document.activeElement;
    el?.showModal();
    el?.querySelector<HTMLElement>(
      "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
    )?.focus({ preventScroll: true });
    return () => {
      el?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (kind !== "session") return;
    studentGeneration.current++;
    let active = true;
    api<{ items: Student[]; nextCursor: string | null }>(studentEndpoint)
      .then((p) => {
        if (active) {
          setStudents((prev) => [
            ...prev.filter(
              (item) => item.id === selected || item.id === student?.id,
            ),
            ...p.items.filter(
              (s) =>
                !prev.some(
                  (x) =>
                    (x.id === selected || x.id === student?.id) &&
                    x.id === s.id,
                ),
            ),
          ]);
          setCursor(p.nextCursor);
          setStudentsError("");
        }
      })
      .catch(() => {
        if (active)
          setStudentsError(
            "Chưa tải được học viên. Đóng form và thử lại, hoặc tải lại danh sách bên dưới.",
          );
      });
    return () => {
      active = false;
    };
  }, [kind, studentEndpoint, selected, student]);
  useEffect(() => {
    if (kind !== "session" || !selected || !date) return;
    let active = true;
    api<{ items: TeachingSession[] }>(
      `/api/sessions?studentId=${selected}&from=${date}&to=${date}&limit=50`,
    )
      .then((p) => {
        if (active)
          setDuplicate(
            p.items.some(
              (s) => s.id !== lesson?.id && (s.startTime ?? "") === time,
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [kind, selected, date, time, lesson?.id]);
  async function moreStudents() {
    if (studentsBusy || studentSearch !== studentTerm) return;
    const generation = studentGeneration.current;
    setStudentsBusy(true);
    try {
      const p = await api<{ items: Student[]; nextCursor: string | null }>(
        `${studentEndpoint}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (generation !== studentGeneration.current) return;
      setStudents((prev) => [
        ...prev,
        ...p.items.filter((s) => !prev.some((x) => x.id === s.id)),
      ]);
      setCursor(p.nextCursor);
      setStudentsError("");
    } catch {
      if (generation === studentGeneration.current)
        setStudentsError("Chưa tải được học viên. Vui lòng thử lại.");
    } finally {
      setStudentsBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const values = new FormData(e.currentTarget);
    const payload =
      kind === "student"
        ? {
            displayName: String(values.get("displayName")),
            contactName: String(values.get("contactName")),
            phone: String(values.get("phone")),
            defaultRateVnd: Number(values.get("defaultRateVnd")),
            privateNote: String(values.get("privateNote")),
          }
        : {
            studentId: selected,
            sessionDate: date,
            startTime: time || null,
            durationMinutes: lesson?.lessonId
              ? lesson.durationMinutes
              : values.get("durationMinutes")
                ? Number(values.get("durationMinutes"))
                : null,
            status,
            billable: status === "cancelled" ? false : billable,
            rateVnd: rate,
            privateNote: String(values.get("privateNote")),
          };
    const serialized = JSON.stringify(payload);
    if (request.current?.payload !== serialized)
      request.current = { payload: serialized, id: crypto.randomUUID() };
    try {
      await api(
        `/api/${kind === "student" ? "students" : "sessions"}${record ? `/${record.id}` : ""}`,
        {
          method: record ? "PATCH" : "POST",
          body: payload,
          requestId: request.current!.id,
        },
      );
      const name =
        students.find((s) => s.id === selected)?.displayName ??
        lesson?.studentName ??
        "học viên";
      onSaved(
        kind === "student"
          ? `Đã lưu học viên ${values.get("displayName")}.`
          : `Đã lưu buổi ${name} ngày ${date.split("-").reverse().join("/")}: ${formatVnd(sessionAmount({ status, billable, rateVnd: rate }))}.`,
      );
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Chưa kết nối được máy chủ."
          : e instanceof Error
            ? e.message
            : "Chưa lưu được. Hãy thử lại.",
      );
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="record-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <div>
          <p className="mb-1 text-[10px] tracking-[.16em] text-muted-foreground">
            CUỐN SỔ CỦA BẠN
          </p>
          <h2 id="record-title" className="serif text-2xl">
            {kind === "student"
              ? s
                ? "Sửa học viên"
                : "Thêm học viên"
              : lesson
                ? "Sửa buổi dạy"
                : "Ghi buổi dạy"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Đóng biểu mẫu"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-4 p-6">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          {kind === "student" ? (
            <>
              <label className="field-label">
                Tên học viên *
                <Input
                  name="displayName"
                  required
                  maxLength={100}
                  defaultValue={s?.displayName}
                  placeholder="Ví dụ: Nguyễn Lan"
                />
              </label>
              <label className="field-label">
                Đơn giá mặc định / buổi (VND) *
                <Input
                  name="defaultRateVnd"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_VND}
                  step={1}
                  required
                  defaultValue={s?.defaultRateVnd ?? 200000}
                />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                Đổi đơn giá chỉ áp dụng cho buổi mới. Giá các buổi đã ghi được
                giữ nguyên.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Tên người liên hệ
                  <Input
                    name="contactName"
                    maxLength={100}
                    defaultValue={s?.contactName}
                  />
                </label>
                <label className="field-label">
                  Số điện thoại
                  <Input
                    name="phone"
                    type="tel"
                    maxLength={30}
                    defaultValue={s?.phone}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              {!lesson && (
                <label className="field-label">
                  Dạy cho
                  <select
                    className="select-input"
                    value="single"
                    onChange={(event) => {
                      if (event.target.value !== "single") {
                        onClose();
                        router.push(
                          `/app/lessons/new?mode=${event.target.value}`,
                        );
                      }
                    }}
                  >
                    <option value="single">Một học viên</option>
                    <option value="group">Nhóm học viên tự chọn</option>
                    <option value="class">Một lớp học</option>
                  </select>
                </label>
              )}
              {!lesson && (
                <label className="field-label">
                  Tìm tên học viên
                  <Input
                    type="search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    maxLength={100}
                    placeholder="Có dấu hoặc không dấu"
                  />
                </label>
              )}
              <label className="field-label">
                Học viên *
                <select
                  required
                  disabled={!!lesson}
                  className="select-input"
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    const found = students.find((s) => s.id === e.target.value);
                    if (found) setRate(found.defaultRateVnd);
                  }}
                >
                  <option value="">Chọn học viên</option>
                  {lesson &&
                    !students.some((s) => s.id === lesson.studentId) && (
                      <option value={lesson.studentId}>
                        {lesson.studentName}
                      </option>
                    )}
                  {students
                    .filter((s) => !s.archivedAt || s.id === lesson?.studentId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                </select>
              </label>
              {(cursor || studentsError) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={moreStudents}
                  disabled={studentsBusy || studentSearch !== studentTerm}
                >
                  {studentsBusy
                    ? "Đang tải…"
                    : "Tải thêm / thử lại danh sách học viên"}
                </Button>
              )}
              {studentsError && (
                <p className="text-xs text-destructive">{studentsError}</p>
              )}
              {!students.length && !studentsError && (
                <p className="text-xs leading-5 text-muted-foreground">
                  {studentTerm
                    ? "Chưa tìm thấy học viên phù hợp. Thử tên khác hoặc tìm tiếp trong danh sách."
                    : "Cần thêm học viên trước khi ghi buổi. Vào mục Học viên để tạo học viên đầu tiên."}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <label className="field-label">
                  Ngày dạy *
                  <Input
                    required
                    disabled={!!lesson?.lessonId}
                    type="date"
                    min="1900-01-01"
                    max="2100-12-31"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Trạng thái
                  <select
                    className="select-input"
                    value={status}
                    onChange={(e) => {
                      const v = e.target.value as TeachingSession["status"];
                      setStatus(v);
                      if (v === "cancelled") setBillable(false);
                    }}
                  >
                    <option value="completed">Đã dạy</option>
                    <option value="planned">Dự kiến</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </label>
                <label className="field-label">
                  Giờ bắt đầu (tùy chọn)
                  <Input
                    type="time"
                    disabled={!!lesson?.lessonId}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Thời lượng (phút)
                  <Input
                    type="number"
                    name="durationMinutes"
                    disabled={!!lesson?.lessonId}
                    min={1}
                    max={1440}
                    step={1}
                    defaultValue={lesson?.durationMinutes ?? ""}
                  />
                </label>
              </div>
              {duplicate && (
                <p
                  role="status"
                  className="rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning-foreground"
                >
                  Đã có buổi cùng học viên, ngày và giờ. Bạn vẫn có thể lưu nếu
                  đây là buổi khác.
                </p>
              )}
              <label className="field-label">
                Đơn giá buổi này (VND) *
                <Input
                  type="number"
                  disabled={!!lesson?.lessonId}
                  required
                  inputMode="numeric"
                  min={0}
                  max={MAX_VND}
                  step={1}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
              </label>
              {lesson?.lessonId && (
                <p className="text-xs leading-5 text-muted-foreground">
                  Ngày, giờ và đơn giá chung được sửa tại trang buổi nhóm/lớp.
                  Bạn có thể đổi trạng thái, miễn phí hoặc ghi chú riêng cho học
                  viên này.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={status !== "cancelled" && billable}
                  disabled={status === "cancelled"}
                  onChange={(e) => setBillable(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Tính phí buổi này
              </label>
              <div className="flex items-center justify-between rounded-xl bg-accent-soft p-4 text-sm">
                <span>
                  {status === "planned"
                    ? "Học phí dự kiến"
                    : "Học phí buổi dạy"}
                </span>
                <strong>
                  {formatVnd(
                    status === "planned" && billable
                      ? rate
                      : sessionAmount({ status, billable, rateVnd: rate }),
                  )}
                </strong>
              </div>
            </>
          )}
          <label className="field-label">
            Ghi chú riêng
            <textarea
              name="privateNote"
              maxLength={1000}
              rows={3}
              defaultValue={s?.privateNote ?? lesson?.privateNote}
              className="select-input resize-y"
              placeholder="Chỉ bạn xem được"
            />
          </label>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger-soft p-3 text-sm leading-5 text-destructive"
          >
            {error} Nội dung vẫn ở đây; bạn có thể thử lưu lại.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Để sau
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            {busy
              ? "Đang lưu…"
              : error
                ? "Thử lưu lại"
                : kind === "student"
                  ? "Lưu học viên"
                  : "Lưu buổi dạy"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
