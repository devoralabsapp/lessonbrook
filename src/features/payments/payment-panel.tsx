"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useState } from "react";
import { Banknote, ChevronDown, Landmark, Pencil, Trash2 } from "lucide-react";
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
  const [openRow, setOpenRow] = useState<{
    id: string;
    mode: "details" | "edit" | "delete";
  } | null>(null);
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
  const formOpen = openRow !== null && openRow.mode !== "details";
  function toggleRow(id: string, mode: NonNullable<typeof openRow>["mode"]) {
    draft.saved();
    mutation.clearError();
    setNotice("");
    setOpenRow(
      openRow?.id === id && openRow.mode === mode ? null : { id, mode },
    );
  }
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
      setOpenRow(null);
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
      setOpenRow(null);
      setNotice(t("Đã xóa khoản thu khỏi số tiền đã nhận."));
      onChanged();
    }
  }
  return (
    <Card className="space-y-3 px-3 py-4 sm:px-6">
      <h2 className="serif px-1 text-2xl">{t("Lịch sử thanh toán")}</h2>
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
          <ul
            role="list"
            className="@container divide-y divide-border rounded-xl border border-border"
          >
            {page.items.map((payment) => {
              const mode = openRow?.id === payment.id ? openRow.mode : null;
              const panelId = `payment-${payment.id}-details`;
              const date = formatDate(payment.receivedDate, locale);
              const numericDate = formatDate(payment.receivedDate);
              const cash = payment.method === "cash";
              const method = t(cash ? "Tiền mặt" : "Chuyển khoản");
              const MethodIcon = cash ? Banknote : Landmark;
              const hasDetails = Boolean(
                payment.privateNote || payment.voidReason,
              );
              const metadata = (
                <>
                  <time dateTime={payment.receivedDate} aria-label={date}>
                    <span className="@[18rem]:hidden">
                      {numericDate.replace(/\d{4}$/, (year) => year.slice(2))}
                    </span>
                    <span className="hidden @[18rem]:inline @lg:hidden">
                      {numericDate}
                    </span>
                    <span className="hidden @lg:inline">{date}</span>
                  </time>
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={method}
                  >
                    <MethodIcon size={15} aria-hidden="true" />
                    <span className="sr-only @lg:not-sr-only">{method}</span>
                  </span>
                </>
              );

              return (
                <li
                  key={payment.id}
                  data-testid="payment-row"
                  className="px-2 @lg:px-4"
                >
                  <div
                    className="flex min-h-13 items-center gap-1.5 py-2 @lg:gap-5"
                    data-slot="payment-summary"
                  >
                    <strong className="min-w-0 text-xs wrap-anywhere tabular-nums @lg:text-sm">
                      {formatVnd(payment.amountVnd, locale)}
                    </strong>
                    {hasDetails ? (
                      <button
                        type="button"
                        aria-expanded={mode === "details"}
                        aria-controls={mode === "details" ? panelId : undefined}
                        disabled={formOpen}
                        onClick={() => toggleRow(payment.id, "details")}
                        className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-x-1 rounded-lg text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring @[18rem]:no-underline @lg:gap-x-3 @lg:text-sm"
                      >
                        {metadata}
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className={`hidden @[18rem]:block ${mode === "details" ? "rotate-180" : ""}`}
                        />
                        <span className="sr-only">
                          {t("Chi tiết khoản thu")}
                        </span>
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-xs text-muted-foreground @lg:gap-x-3 @lg:text-sm">
                        {metadata}
                      </div>
                    )}
                    {payment.voidedAt ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {t("Đã vô hiệu hóa")}
                      </span>
                    ) : (
                      statement.status === "issued" && (
                        <div className="flex shrink-0 items-center gap-1 @lg:gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 @lg:w-auto @lg:px-3"
                            aria-label={t("Sửa khoản thu")}
                            title={t("Sửa khoản thu")}
                            aria-expanded={mode === "edit"}
                            aria-controls={
                              mode === "edit" ? panelId : undefined
                            }
                            disabled={
                              mutation.busy || (formOpen && mode !== "edit")
                            }
                            onClick={() => toggleRow(payment.id, "edit")}
                          >
                            <Pencil aria-hidden="true" />
                            <span className="hidden @lg:inline">
                              {t("Sửa khoản thu")}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 text-destructive @lg:w-auto @lg:px-3"
                            aria-label={t("Xóa khoản thu")}
                            title={t("Xóa khoản thu")}
                            aria-expanded={mode === "delete"}
                            aria-controls={
                              mode === "delete" ? panelId : undefined
                            }
                            disabled={
                              mutation.busy || (formOpen && mode !== "delete")
                            }
                            onClick={() => toggleRow(payment.id, "delete")}
                          >
                            <Trash2 aria-hidden="true" />
                            <span className="hidden @lg:inline">
                              {t("Xóa khoản thu")}
                            </span>
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                  {mode === "details" && (
                    <div
                      id={panelId}
                      className="space-y-2 border-t border-border py-3 text-xs text-muted-foreground"
                    >
                      {payment.privateNote && (
                        <p className="whitespace-pre-wrap wrap-anywhere">
                          {t("Ghi chú riêng:")} {payment.privateNote}
                        </p>
                      )}
                      {payment.voidReason && (
                        <p className="whitespace-pre-wrap wrap-anywhere">
                          {t("Lý do:")} {payment.voidReason}
                        </p>
                      )}
                    </div>
                  )}
                  {mode === "edit" && (
                    <form
                      id={panelId}
                      onSubmit={(event) => edit(event, payment)}
                      {...draft.form}
                      className="border-t border-border py-3"
                    >
                      <fieldset
                        disabled={mutation.busy}
                        className="min-w-0 space-y-3"
                      >
                        <PaymentFields
                          payment={payment}
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
                            onClick={() => toggleRow(payment.id, "edit")}
                          >
                            {t("Hủy")}
                          </Button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                  {mode === "delete" && (
                    <form
                      id={panelId}
                      onSubmit={(event) => voidRecord(event, payment.id)}
                      {...draft.form}
                      className="border-t border-border py-3"
                    >
                      <fieldset
                        disabled={mutation.busy}
                        className="min-w-0 space-y-3"
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
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="destructive">
                            {t("Xác nhận xóa khoản thu")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => toggleRow(payment.id, "delete")}
                          >
                            {t("Hủy")}
                          </Button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
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
