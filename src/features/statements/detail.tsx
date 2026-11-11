"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatVnd, vietnamToday } from "@/domain";
import { type Statement, statementDisplayStatus } from "@/domain/statements";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatementEditor } from "./editor";
import { formatDate, useStatementMutation } from "./shared";
import { CashPayment, PaymentPanel } from "@/features/payments/payment-panel";
import { BankTransferDetails } from "@/features/payments/bank-transfer-details";
import { SharingPanel } from "@/features/sharing/sharing-panel";
import { useMobileDraft } from "@/lib/use-mobile-draft";
type StatementDetailData = Statement & { transferReference: string | null };
export function StatementDetail({
  id,
  nativeShare,
}: {
  id: string;
  nativeShare: boolean;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<StatementDetailData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useStatementMutation();
  const cancellationDraft = useMobileDraft(mutation.busy);
  useEffect(() => {
    let active = true;
    let issued = false;
    let generation = 0;
    function load(quiet = false) {
      const request = ++generation;
      api<StatementDetailData>(`/api/statements/${encodeURIComponent(id)}`)
        .then((statement) => {
          if (active && request === generation) {
            issued = statement.status === "issued";
            setData(statement);
            setError("");
          }
        })
        .catch((error) => {
          if (active && request === generation && !quiet)
            setError(error.message);
        });
    }
    function refreshWhenVisible() {
      if (issued && document.visibilityState === "visible") load(true);
    }
    load();
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [id, revision, t]);
  if (error)
    return (
      <Card role="alert" className="space-y-4 p-6">
        <p className="text-sm text-destructive">{t(error)}</p>
        <Button
          variant="outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          {t("Tải lại bảng kê")}
        </Button>
        <Link href="/app/statements" className="block text-sm text-primary">
          {t("Quay lại danh sách")}
        </Link>
      </Card>
    );
  if (!data || data.id !== id)
    return (
      <p role="status" className="p-8 text-sm">
        {t("Đang mở bảng kê…")}
      </p>
    );
  const canEditIssued =
    data.status === "issued" && !data.activePaymentCount && !data.paidVnd;
  if (editing && (data.status === "draft" || canEditIssued))
    return (
      <StatementEditor
        initial={data}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          mutation.clearError();
          setEditing(false);
          setData(null);
          setRevision((value) => value + 1);
        }}
      />
    );
  const display = statementDisplayStatus(data, vietnamToday());
  const paymentTone =
    data.status !== "issued"
      ? "bg-card text-foreground"
      : data.paidVnd === data.totalVnd
        ? "status-completed"
        : data.paidVnd > 0
          ? "bg-warning-soft text-warning-foreground"
          : "bg-danger-soft text-destructive";
  const refresh = () => setRevision((value) => value + 1);
  async function issue() {
    const result = await mutation.run(`/api/statements/${id}/issue`, "POST", {
      version: data!.version,
    });
    if (result) {
      setData(null);
      setRevision((value) => value + 1);
    }
  }
  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutation.run(`/api/statements/${id}/void`, "POST", {
      version: data!.version,
      reason,
    });
    if (result) {
      cancellationDraft.saved();
      setData(null);
      setRevision((value) => value + 1);
    }
  }
  return (
    <div className="fade-in space-y-6">
      <div>
        <Link href="/app/statements" className="text-xs text-primary">
          {t("← Danh sách bảng kê")}
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="serif break-words text-3xl">
            {data.number ?? t("Xem trước bản nháp")}
          </h1>
          {canEditIssued && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              {t("Sửa bảng kê")}
            </Button>
          )}
        </div>
      </div>
      <Card className="overflow-hidden" data-testid="statement-preview">
        <div className="space-y-4 border-b border-border bg-accent-soft p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <p className="py-1 text-xs font-semibold tracking-widest text-primary">
              {t("BẢNG KÊ HỌC PHÍ")}
            </p>
            <span
              role="status"
              className={`shrink-0 rounded-lg border border-current px-2.5 py-1 text-xs font-bold ${paymentTone}`}
            >
              {t(display.label)}
              {display.overdue ? t(" · Quá hạn") : ""}
            </span>
          </div>
          <h2 className="serif break-words text-2xl">
            {data.teacherSnapshot.displayName}
          </h2>
          <p className="break-words text-sm">
            {t("Học viên: ")}
            <strong>{data.recipientSnapshot.displayName}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Kỳ học ")}
            {formatDate(data.periodStart, locale)} –{" "}
            {formatDate(data.periodEnd, locale)}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <span>
              {t("Ngày phát hành:")}{" "}
              {data.issueDate
                ? formatDate(data.issueDate, locale)
                : t("Chưa phát hành")}
            </span>
            <span>
              {t("Ngày đến hạn: ")}
              {formatDate(data.dueDate, locale)}
            </span>
          </div>
        </div>
        <ol className="divide-y divide-border">
          {data.items.map((item, index) => (
            <li
              key={item.sessionId}
              className="flex items-center justify-between gap-3 px-5 py-4 text-sm sm:px-7"
            >
              <span>
                {index + 1}
                {t(". Buổi ")}
                {formatDate(item.sessionDate, locale)}
              </span>
              <strong>{formatVnd(item.amountVnd, locale)}</strong>
            </li>
          ))}
        </ol>
        <div className="space-y-3 border-t border-border p-5 text-sm sm:p-7">
          <p className="flex justify-between gap-2">
            <span>
              {t("Tổng học phí · ")}
              {data.items.length}
              {t(" buổi")}
            </span>
            <strong data-testid="statement-total">
              {formatVnd(data.totalVnd, locale)}
            </strong>
          </p>
          {data.status !== "draft" && (
            <>
              <p className="flex justify-between gap-2">
                <span>{t("Đã ghi nhận thu")}</span>
                <strong>{formatVnd(data.paidVnd, locale)}</strong>
              </p>
              <p className="flex justify-between gap-2">
                <span>
                  {data.status === "void"
                    ? t("Khoản phải thu đã hủy")
                    : t("Còn phải thu")}
                </span>
                <strong>
                  {formatVnd(
                    data.status === "void" ? 0 : data.totalVnd - data.paidVnd,
                    locale,
                  )}
                </strong>
              </p>
            </>
          )}
          {data.status === "issued" && (
            <CashPayment key={data.id} statement={data} onChanged={refresh} />
          )}
        </div>
        <BankTransferDetails
          bank={data.status === "issued" ? data.bankTransferSnapshot : null}
          legacyDetails={data.bankSnapshot}
          reference={data.transferReference}
          remainingVnd={data.totalVnd - data.paidVnd}
          className="border-t border-border p-5 sm:p-7"
        />
      </Card>
      {mutation.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      )}
      {data.status === "draft" ? (
        <Card className="space-y-4 p-5">
          <p className="text-sm leading-6">
            {t(
              "Kiểm tra tên, các buổi và số tiền ở trên. Khi phát hành, bảng kê sẽ chốt nội dung, khóa các buổi và dùng thông tin chuyển khoản đã lưu để tạo VietQR.",
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={mutation.busy} onClick={issue}>
              {mutation.busy ? t("Đang phát hành…") : t("Phát hành bảng kê")}
            </Button>
            <Button
              variant="outline"
              disabled={mutation.busy}
              onClick={() => setEditing(true)}
            >
              {t("Sửa nháp")}
            </Button>
          </div>
        </Card>
      ) : data.status === "issued" ? (
        <>
          <PaymentPanel statement={data} onChanged={refresh} />
          <SharingPanel
            statement={data}
            nativeShare={nativeShare}
            onChanged={() => setRevision((value) => value + 1)}
          />
          <Card className="p-5">
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {t("Hủy bảng kê")}
              </summary>
              <form
                onSubmit={cancel}
                {...cancellationDraft.form}
                className="mt-4 space-y-4"
              >
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    "Chỉ hủy khi không còn khoản thu hợp lệ. Bản cũ và lịch sử được giữ; các buổi sẽ được giải phóng để lập bảng kê lại.",
                  )}
                </p>
                <label className="field-label">
                  {t("Lý do hủy")}
                  <textarea
                    className="select-input min-h-24"
                    required
                    maxLength={500}
                    value={reason}
                    disabled={mutation.busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    mutation.busy ||
                    data.paidVnd > 0 ||
                    data.activePaymentCount > 0
                  }
                >
                  {mutation.busy ? t("Đang hủy…") : t("Xác nhận hủy bảng kê")}
                </Button>
              </form>
            </details>
          </Card>
        </>
      ) : (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("Bảng kê đã hủy")}</h2>
          <p className="break-words text-sm">
            {t("Lý do: ")}
            {data.voidReason}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Nội dung cũ được giữ để đối chiếu. Bảng kê này không còn tạo khoản phải thu; các buổi có thể lập bảng kê mới.",
            )}
          </p>
          <Button asChild variant="outline">
            <Link
              href={`/app/statements/new?studentId=${encodeURIComponent(data.studentId)}`}
            >
              {t("Lập bảng kê mới")}
            </Link>
          </Button>
        </Card>
      )}
      {data.status === "void" && (
        <PaymentPanel statement={data} onChanged={refresh} />
      )}
      <Link
        href={`/app/students/${data.studentId}`}
        className="block text-sm text-primary"
      >
        {t("Mở sổ học viên →")}
      </Link>
    </div>
  );
}
