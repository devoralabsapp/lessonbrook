"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client-api";
import { formatVnd } from "@/domain";
import type { OnboardingState } from "@/domain/onboarding";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RecordForm } from "@/components/record-form";
import { useStatementMutation } from "@/features/statements/shared";

export function GettingStartedCard({
  state,
}: {
  state: OnboardingState | null;
}) {
  if (!state || state.completed) return null;
  return (
    <Card data-tone="mint" className="mb-6 border-border bg-accent-soft p-5">
      <p className="text-xs font-semibold text-primary">
        BẮT ĐẦU VỚI LESSONBROOK
      </p>
      <h2 className="serif mt-2 text-2xl">Ghi buổi dạy đầu tiên của bạn</h2>
      <p className="my-3 text-sm leading-6 text-muted-foreground">
        Xác nhận tên giáo viên, thêm học viên rồi ghi một buổi đã dạy. Sổ bắt
        đầu từ những buổi bạn nhập, chưa bao gồm nợ cũ.
      </p>
      <Button asChild>
        <Link href="/onboarding">
          {state.profileConfirmed
            ? "Tiếp tục thiết lập"
            : "Thiết lập sổ của bạn"}
          <ArrowRight size={15} />
        </Link>
      </Button>
    </Card>
  );
}
export function OnboardingGuide({ initial }: { initial: OnboardingState }) {
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [modal, setModal] = useState<"student" | "session" | null>(null);
  const [notice, setNotice] = useState("");
  const mutation = useStatementMutation();
  const router = useRouter();
  const running = useRef(false);
  const step = !data.profileConfirmed
    ? 0
    : !data.student && !data.completed
      ? 1
      : !data.session
        ? 2
        : 3;
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await api<OnboardingState>("/api/onboarding"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa tải được tiến trình. Hãy thử lại.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    const form = new FormData(event.currentTarget);
    try {
      const saved = await mutation.run("/api/onboarding", "POST", {
        displayName: String(form.get("displayName")),
        bankDetails: String(form.get("bankDetails")),
      });
      if (saved) {
        await refresh();
        router.refresh();
      }
    } finally {
      running.current = false;
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          SỔ BUỔI DẠY & HỌC PHÍ
        </p>
        <h1 className="serif text-3xl sm:text-4xl">Mở sổ buổi dạy của bạn</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Dành cho dạy cá nhân và lớp học, tính theo buổi và thu sau. Bạn có thể
          dừng và tiếp tục bất cứ lúc nào.
        </p>
      </div>
      <ol
        aria-label="Các bước bắt đầu"
        className="grid grid-cols-3 gap-2 text-xs"
      >
        {["Hồ sơ giáo viên", "Thêm học viên", "Ghi buổi đầu"].map(
          (label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={`rounded-xl border p-3 ${step >= index ? "border-border bg-accent-soft" : "border-border"}`}
            >
              <span className="mb-1 flex items-center gap-1 font-semibold">
                {step > index ? (
                  <>
                    <Check size={14} />
                    Đã xong
                  </>
                ) : (
                  `Bước ${index + 1}`
                )}
              </span>
              {label}
            </li>
          ),
        )}
      </ol>
      {(error || mutation.error) && (
        <Card role="alert" className="p-4 text-sm text-destructive">
          {error || mutation.error}
          {error && (
            <Button variant="ghost" disabled={loading} onClick={refresh}>
              Thử tải lại
            </Button>
          )}
        </Card>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-muted p-4 text-sm">
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle size={16} className="animate-spin" />
          Đang cập nhật tiến trình…
        </p>
      )}
      <Card className="p-5 sm:p-7">
        {step === 0 ? (
          <form onSubmit={confirm}>
            <fieldset className="space-y-5" disabled={mutation.busy || loading}>
              <h2 className="serif text-2xl">Bạn muốn hiển thị tên gì?</h2>
              <label className="field-label">
                Tên giáo viên / tên lớp
                <Input
                  name="displayName"
                  required
                  maxLength={100}
                  defaultValue={data.profile.displayName}
                />
              </label>
              <label className="field-label">
                Thông tin nhận chuyển khoản (tùy chọn)
                <textarea
                  name="bankDetails"
                  className="select-input"
                  rows={3}
                  maxLength={500}
                  defaultValue={data.profile.bankDetails}
                />
              </label>
              <p className="text-xs leading-6 text-muted-foreground">
                Tên này xuất hiện trên bảng kê bạn phát hành. Thông tin chuyển
                khoản chỉ chia sẻ khi bạn chủ động chọn đưa vào bảng kê.
              </p>
              <Button disabled={mutation.busy || loading}>
                {mutation.busy ? "Đang lưu…" : "Lưu và tiếp tục"}
              </Button>
            </fieldset>
          </form>
        ) : step === 1 ? (
          <div className="space-y-4">
            <h2 className="serif text-2xl">Thêm học viên đầu tiên</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Chỉ cần tên và đơn giá mỗi buổi. Thông tin liên hệ có thể bổ sung
              sau; đổi đơn giá sẽ không đổi các buổi cũ.
            </p>
            <Button disabled={loading} onClick={() => setModal("student")}>
              Thêm học viên đầu tiên
            </Button>
          </div>
        ) : step === 2 ? (
          <div className="space-y-4">
            <h2 className="serif text-2xl">Ghi buổi đã dạy đầu tiên</h2>
            <p className="text-sm leading-6">
              {data.student?.displayName} ·{" "}
              {formatVnd(data.student?.defaultRateVnd ?? 0)} / buổi
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Chọn ngày dạy thực tế và trạng thái “Đã dạy”. Bạn có thể ghi bù
              một buổi trước đó.
            </p>
            <Button
              disabled={loading || !data.student}
              onClick={() => setModal("session")}
            >
              Ghi buổi đầu tiên
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="serif text-2xl">Sổ của bạn đã sẵn sàng</h2>
            <p className="text-sm leading-6">
              Đã ghi buổi {data.session?.studentName} ngày{" "}
              {data.session?.sessionDate.split("-").reverse().join("/")}:{" "}
              <strong>{formatVnd(data.session?.amountVnd ?? 0)}</strong>.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Buổi hoàn thành có tính phí sẽ xuất hiện ở “Buổi chưa lập bảng kê”
              cho đến khi bạn phát hành bảng kê. Sau đó bạn có thể gửi link và
              ghi nhận tiền đã nhận.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/app">
                  Xem tổng quan
                  <ArrowRight size={15} />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/students/${data.session?.studentId}`}>
                  Mở sổ học viên
                </Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="text-xs leading-6 text-muted-foreground">
        LessonBrook chỉ tính các buổi bạn đã nhập, chưa bao gồm nợ cũ. Cần mạng
        để lưu dữ liệu.
      </p>
      <Link className="inline-block text-sm text-primary" href="/app">
        Tiếp tục vào ứng dụng
      </Link>
      {modal && (
        <RecordForm
          kind={modal}
          student={data.student ?? undefined}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setNotice(message);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
