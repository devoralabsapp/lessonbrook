"use client";
import { useI18n } from "@/lib/i18n/client";

import { formatVnd, vietnamToday } from "@/domain";
import { type PublicStatement } from "@/domain/sharing";
import { formatDate } from "@/features/statements/shared";
import { BankTransferDetails } from "@/features/payments/bank-transfer-details";
export function PublicStatementView({
  statement: s,
}: {
  statement: PublicStatement;
}) {
  const { t, locale } = useI18n();
  const overdue = s.remainingVnd > 0 && vietnamToday() > s.dueDate;
  return (
    <article
      data-theme="statement"
      className="overflow-hidden rounded-2xl border border-border bg-white text-foreground"
      data-testid="public-statement"
    >
      <header className="space-y-3 border-b border-border bg-[#f5f7ee] p-5 sm:p-7">
        <p className="text-xs font-semibold tracking-widest text-primary">
          {t("BẢNG KÊ HỌC PHÍ")}
        </p>
        <h1 className="serif break-words text-3xl">{s.teacherName}</h1>
        <p className="break-words text-sm">
          {t("Học viên: ")}
          <strong>{s.recipientName}</strong>
        </p>
        <p className="text-xs">
          {s.number}
          {t(" · Phát hành ")}
          {formatDate(s.issueDate, locale)}
        </p>
        <p className="text-xs">
          {t("Đến hạn ")}
          {formatDate(s.dueDate, locale)}
          {overdue ? t(" · Quá hạn") : ""}
        </p>
      </header>
      <ol className="divide-y divide-border">
        {s.items.map((item, index) => (
          <li key={index} className="flex justify-between gap-3 p-5 text-sm">
            <span>
              {index + 1}
              {t(". Buổi ")}
              {formatDate(item.sessionDate, locale)}
            </span>
            <strong>{formatVnd(item.amountVnd, locale)}</strong>
          </li>
        ))}
      </ol>
      <div className="space-y-3 border-t border-border p-5 text-sm">
        <p className="flex justify-between gap-3">
          <span>{t("Tổng học phí")}</span>
          <strong>{formatVnd(s.totalVnd, locale)}</strong>
        </p>
        <p className="flex justify-between gap-3">
          <span>{t("Đã ghi nhận thu")}</span>
          <strong>{formatVnd(s.paidVnd, locale)}</strong>
        </p>
        <p className="flex justify-between gap-3 text-base">
          <span>{t("Còn phải thu")}</span>
          <strong data-testid="public-remaining">
            {formatVnd(s.remainingVnd, locale)}
          </strong>
        </p>
        <p className="text-xs text-muted-foreground">
          {s.remainingVnd === 0
            ? t("Đã thu đủ")
            : s.paidVnd > 0
              ? t("Thu một phần")
              : t("Chưa thu")}{" "}
          {t("· Theo ghi nhận của giáo viên")}
        </p>
      </div>
      {s.payments.length > 0 && (
        <section className="space-y-3 border-t border-border p-5">
          <h2 className="text-sm font-semibold">
            {t("Các khoản đã ghi nhận thu")}
          </h2>
          {s.payments.map((payment, i) => (
            <p key={i} className="flex justify-between gap-3 text-sm">
              <span>{formatDate(payment.receivedDate, locale)}</span>
              <strong>{formatVnd(payment.amountVnd, locale)}</strong>
            </p>
          ))}
        </section>
      )}
      <BankTransferDetails
        bank={s.bankTransfer}
        legacyDetails={s.bankDetails}
        reference={s.transferReference}
        remainingVnd={s.remainingVnd}
        className="border-t border-border p-5"
      />
      <footer className="space-y-2 border-t border-border p-5 text-xs leading-5 text-muted-foreground">
        <p>
          {t("Cập nhật")}{" "}
          {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
            timeZone: "Asia/Ho_Chi_Minh",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(s.updatedAt))}
        </p>
        <p>
          {t(
            "Số liệu theo ghi nhận của giáo viên, không phải xác nhận giao dịch từ ngân hàng. Nếu cần đối chiếu, vui lòng liên hệ giáo viên.",
          )}
        </p>
      </footer>
    </article>
  );
}
