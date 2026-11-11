"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import { useMobileDraft } from "@/lib/use-mobile-draft";
import { formatVnd, vietnamToday } from "@/domain";
import { type Statement } from "@/domain/statements";
import { type Payment } from "@/domain/payments";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  formatDate,
  type Page,
  useStatementMutation,
} from "@/features/statements/shared";
export function PaymentPanel({
  statement,
  onChanged,
}: {
  statement: Statement;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    key: string;
    page: Page<Payment>;
  } | null>(null);
  const [error, setError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(vietnamToday());
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const endpoint = `/api/statements/${statement.id}/payments`;
  const key = `${statement.version}:${revision}`;
  useEffect(() => {
    let active = true;
    api<Page<Payment>>(endpoint)
      .then((page) => {
        if (active) setData({ key, page });
      })
      .catch((error) => {
        if (active) setError({ key, message: error.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  const page = data?.key === key ? data.page : null;
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Payment>>(
        `${endpoint}?cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (item) =>
                      !current.page.items.some((old) => old.id === item.id),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
    } catch (error) {
      setError({
        key,
        message:
          error instanceof Error
            ? error.message
            : t("Chưa tải được khoản thu."),
      });
    } finally {
      setMoreBusy(false);
    }
  }
  async function record(event: React.FormEvent) {
    event.preventDefault();
    const result = await mutation.run(endpoint, "POST", {
      amountVnd: Number(amount),
      receivedDate,
      method,
      privateNote: note,
    });
    if (result) {
      draft.saved();
      setAmount("");
      setNote("");
      setNotice(t("Đã ghi nhận khoản thu. Số còn thiếu đang được cập nhật."));
      onChanged();
    }
  }
  async function voidRecord(
    event: React.FormEvent<HTMLFormElement>,
    paymentId: string,
  ) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    );
    const result = await mutation.run(
      `/api/payments/${paymentId}/void`,
      "POST",
      { reason },
    );
    if (result) {
      setNotice(
        t("Đã vô hiệu hóa ghi nhận; đây không phải hoàn tiền thực tế."),
      );
      onChanged();
    }
  }
  return (
    <Card className="space-y-5 p-5 sm:p-7">
      <h2 className="serif text-2xl">{t("Thu tiền và đối chiếu")}</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          "Giáo viên tự xác nhận tiền đã nhận ngoài đời rồi ghi vào sổ. Một khoản nhận dùng trả nhiều bảng kê cần nhập thành từng khoản riêng.",
        )}
      </p>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      {statement.status === "issued" &&
        statement.paidVnd < statement.totalVnd && (
          <form onSubmit={record} {...draft.form}>
            <fieldset disabled={mutation.busy} className="space-y-4">
              <h3 className="text-sm font-semibold">
                {t("Ghi nhận thu tiền")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  {t("Số tiền nhận (VND)")}
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={statement.totalVnd - statement.paidVnd}
                    step={1}
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  {t("Ngày nhận tiền")}
                  <Input
                    type="date"
                    min="1900-01-01"
                    max={vietnamToday()}
                    required
                    value={receivedDate}
                    onChange={(event) => setReceivedDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="field-label">
                {t("Cách nhận")}
                <ThemedSelect
                  label={t("Cách nhận")}
                  value={method}
                  onChange={(value) => {
                    draft.changed();
                    setMethod(value);
                  }}
                  options={[
                    { value: "transfer", label: t("Chuyển khoản") },
                    { value: "cash", label: t("Tiền mặt") },
                  ]}
                />
              </label>
              <label className="field-label">
                {t("Ghi chú khoản thu (riêng)")}
                <textarea
                  className="select-input min-h-20"
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <Button type="submit">
                {mutation.busy ? t("Đang lưu…") : t("Lưu khoản thu")}
              </Button>
            </fieldset>
          </form>
        )}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">{t("Lịch sử ghi nhận thu")}</h3>
        {error?.key === key ? (
          <div role="alert" className="space-y-3 text-sm text-destructive">
            <p>{t(error.message)}</p>
            <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
              {t("Tải lại khoản thu")}
            </Button>
          </div>
        ) : !page ? (
          <p role="status" className="text-sm">
            {t("Đang tải khoản thu…")}
          </p>
        ) : page.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Chưa có khoản thu được ghi nhận.")}
          </p>
        ) : (
          page.items.map((payment) => (
            <div
              key={payment.id}
              data-testid="payment-row"
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong>{formatVnd(payment.amountVnd, locale)}</strong>
                <span>
                  {formatDate(payment.receivedDate, locale)} ·{" "}
                  {payment.method === "cash"
                    ? t("Tiền mặt")
                    : t("Chuyển khoản")}
                </span>
              </div>
              {payment.privateNote && (
                <p className="whitespace-pre-wrap break-words text-xs">
                  {t("Ghi chú riêng: ")}
                  {payment.privateNote}
                </p>
              )}
              {payment.voidedAt ? (
                <p className="break-words text-xs text-muted-foreground">
                  {t("Đã vô hiệu hóa · ")}
                  {payment.voidReason}
                </p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-xs text-primary">
                    {t("Vô hiệu hóa khoản thu")}
                  </summary>
                  <form
                    onSubmit={(event) => voidRecord(event, payment.id)}
                    className="mt-3 space-y-3"
                  >
                    <p className="text-xs leading-5">
                      {t(
                        "Chỉ sửa sổ ghi nhận, không phải hoàn tiền. Sau đó bạn có thể nhập khoản đúng.",
                      )}
                    </p>
                    <label className="field-label">
                      {t("Lý do vô hiệu hóa")}
                      <textarea
                        name="reason"
                        required
                        maxLength={500}
                        className="select-input min-h-20"
                        disabled={mutation.busy}
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={mutation.busy}
                    >
                      {t("Xác nhận vô hiệu hóa")}
                    </Button>
                  </form>
                </details>
              )}
            </div>
          ))
        )}
        {page?.nextCursor && (
          <Button variant="outline" disabled={moreBusy} onClick={more}>
            {moreBusy ? t("Đang tải…") : t("Tải thêm khoản thu")}
          </Button>
        )}
      </div>
    </Card>
  );
}
