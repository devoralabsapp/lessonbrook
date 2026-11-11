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
import {
  formatDate,
  type Page,
  useStatementMutation,
} from "@/features/statements/shared";
function PaymentFields({ payment, max }: { payment?: Payment; max: number }) {
  const { t } = useI18n();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label min-w-0">
          {t("Số tiền nhận (VND)")}
          <Input
            type="number"
            name="amountVnd"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            required
            defaultValue={payment?.amountVnd}
          />
        </label>
        <label className="field-label min-w-0">
          {t("Ngày nhận tiền")}
          <Input
            type="date"
            name="receivedDate"
            min="1900-01-01"
            max={vietnamToday()}
            required
            defaultValue={payment?.receivedDate ?? vietnamToday()}
          />
        </label>
      </div>
      <label className="field-label">
        {t("Ghi chú khoản thu (riêng)")}
        <textarea
          name="privateNote"
          className="select-input min-h-20"
          maxLength={500}
          defaultValue={payment?.privateNote}
        />
      </label>
    </>
  );
}

function paymentFields(form: HTMLFormElement) {
  const values = new FormData(form);
  return {
    amountVnd: Number(values.get("amountVnd")),
    receivedDate: String(values.get("receivedDate")),
    privateNote: String(values.get("privateNote") ?? ""),
  };
}

export function CashPayment({
  statement,
  onChanged,
}: {
  statement: Statement;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const mutation = useStatementMutation();
  const draft = useMobileDraft(mutation.busy);
  const remaining = statement.totalVnd - statement.paidVnd;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutation.run(
      `/api/statements/${statement.id}/payments`,
      "POST",
      {
        ...paymentFields(event.currentTarget),
        method: "cash",
      },
    );
    if (result) {
      draft.saved();
      setOpen(false);
      setNotice(true);
      onChanged();
    }
  }
  return (
    <>
      {remaining > 0 && !open && (
        <Button
          type="button"
          onClick={() => {
            setNotice(false);
            setOpen(true);
          }}
        >
          {t("Đã trả bằng tiền mặt")}
        </Button>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {t("Đã lưu khoản thu tiền mặt.")}
        </p>
      )}
      {remaining > 0 && open && (
        <form
          onSubmit={save}
          {...draft.form}
          className="rounded-xl border border-border p-4"
        >
          <fieldset disabled={mutation.busy} className="min-w-0 space-y-4">
            <h3 className="text-sm font-semibold">
              {t("Đã trả bằng tiền mặt")}
            </h3>
            <PaymentFields max={remaining} />
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">
                {mutation.busy ? t("Đang lưu…") : t("Lưu khoản thu")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  draft.saved();
                  mutation.clearError();
                  setOpen(false);
                }}
              >
                {t("Hủy")}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}

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
  const [editing, setEditing] = useState<Payment | null>(null);
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
  async function edit(
    event: React.FormEvent<HTMLFormElement>,
    payment: Payment,
  ) {
    event.preventDefault();
    const result = await mutation.run(`/api/payments/${payment.id}`, "PATCH", {
      ...paymentFields(event.currentTarget),
      expectedUpdatedAt: payment.updatedAt ?? null,
    });
    if (result) {
      draft.saved();
      setEditing(null);
      setNotice(t("Đã cập nhật khoản thu."));
      onChanged();
    }
  }
  async function voidRecord(
    event: React.FormEvent<HTMLFormElement>,
    paymentId: string,
  ) {
    event.preventDefault();
    const reason =
      String(new FormData(event.currentTarget).get("reason") ?? "").trim() ||
      "Giáo viên xóa khoản thu.";
    const result = await mutation.run(
      `/api/payments/${paymentId}/void`,
      "POST",
      { reason },
    );
    if (result) {
      draft.saved();
      setNotice(t("Đã xóa khoản thu khỏi số tiền đã nhận."));
      onChanged();
    }
  }
  return (
    <Card className="space-y-5 p-5 sm:p-7">
      <h2 className="serif text-2xl">{t("Lịch sử thanh toán")}</h2>
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
      <div className="space-y-4">
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
                statement.status === "issued" && (
                  <>
                    {editing?.id === payment.id ? (
                      <form
                        onSubmit={(event) => edit(event, editing)}
                        {...draft.form}
                      >
                        <fieldset
                          disabled={mutation.busy}
                          className="min-w-0 space-y-3"
                        >
                          <PaymentFields
                            payment={editing}
                            max={
                              statement.totalVnd -
                              statement.paidVnd +
                              payment.amountVnd
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit">
                              {t("Lưu thay đổi khoản thu")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                draft.saved();
                                mutation.clearError();
                                setEditing(null);
                              }}
                            >
                              {t("Hủy")}
                            </Button>
                          </div>
                        </fieldset>
                      </form>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!!editing || mutation.busy}
                        onClick={() => {
                          setNotice("");
                          mutation.clearError();
                          setEditing(payment);
                        }}
                      >
                        {t("Sửa khoản thu")}
                      </Button>
                    )}
                    {!editing && (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">
                          {t("Xóa khoản thu")}
                        </summary>
                        <form
                          onSubmit={(event) => voidRecord(event, payment.id)}
                          {...draft.form}
                          className="mt-3 space-y-3"
                        >
                          <p className="text-xs leading-5">
                            {t(
                              "Chỉ sửa sổ ghi nhận, không phải hoàn tiền. Sau đó bạn có thể nhập khoản đúng.",
                            )}
                          </p>
                          <label className="field-label">
                            {t("Lý do xóa (tùy chọn)")}
                            <textarea
                              name="reason"
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
                            {t("Xác nhận xóa khoản thu")}
                          </Button>
                        </form>
                      </details>
                    )}
                  </>
                )
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
