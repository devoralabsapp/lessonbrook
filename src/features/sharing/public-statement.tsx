import { formatVnd, vietnamToday } from "@/domain";
import { type PublicStatement } from "@/domain/sharing";
const date = (value: string) => value.split("-").reverse().join("/");
export function PublicStatementView({
  statement: s,
}: {
  statement: PublicStatement;
}) {
  const overdue = s.remainingVnd > 0 && vietnamToday() > s.dueDate;
  return (
    <article
      data-theme="statement"
      className="overflow-hidden rounded-2xl border border-border bg-white text-foreground"
      data-testid="public-statement"
    >
      <header className="space-y-3 border-b border-border bg-[#f5f7ee] p-5 sm:p-7">
        <p className="text-xs font-semibold tracking-widest text-primary">
          BẢNG KÊ HỌC PHÍ
        </p>
        <h1 className="serif break-words text-3xl">{s.teacherName}</h1>
        <p className="break-words text-sm">
          Học viên: <strong>{s.recipientName}</strong>
        </p>
        <p className="text-xs">
          {s.number} · Phát hành {date(s.issueDate)}
        </p>
        <p className="text-xs">
          Đến hạn {date(s.dueDate)}
          {overdue ? " · Quá hạn" : ""}
        </p>
      </header>
      <ol className="divide-y divide-border">
        {s.items.map((item, index) => (
          <li key={index} className="flex justify-between gap-3 p-5 text-sm">
            <span>
              {index + 1}. Buổi {date(item.sessionDate)}
            </span>
            <strong>{formatVnd(item.amountVnd)}</strong>
          </li>
        ))}
      </ol>
      <div className="space-y-3 border-t border-border p-5 text-sm">
        <p className="flex justify-between gap-3">
          <span>Tổng học phí</span>
          <strong>{formatVnd(s.totalVnd)}</strong>
        </p>
        <p className="flex justify-between gap-3">
          <span>Đã ghi nhận thu</span>
          <strong>{formatVnd(s.paidVnd)}</strong>
        </p>
        <p className="flex justify-between gap-3 text-base">
          <span>Còn phải thu</span>
          <strong data-testid="public-remaining">
            {formatVnd(s.remainingVnd)}
          </strong>
        </p>
        <p className="text-xs text-muted-foreground">
          {s.remainingVnd === 0
            ? "Đã thu đủ"
            : s.paidVnd > 0
              ? "Thu một phần"
              : "Chưa thu"}{" "}
          · Theo ghi nhận của giáo viên
        </p>
      </div>
      {s.payments.length > 0 && (
        <section className="space-y-3 border-t border-border p-5">
          <h2 className="text-sm font-semibold">Các khoản đã ghi nhận thu</h2>
          {s.payments.map((payment, i) => (
            <p key={i} className="flex justify-between gap-3 text-sm">
              <span>{date(payment.receivedDate)}</span>
              <strong>{formatVnd(payment.amountVnd)}</strong>
            </p>
          ))}
        </section>
      )}
      {s.bankDetails && (
        <section className="border-t border-border p-5">
          <h2 className="mb-2 text-sm font-semibold">Thông tin nhận tiền</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {s.bankDetails}
          </p>
        </section>
      )}
      <footer className="space-y-2 border-t border-border p-5 text-xs leading-5 text-muted-foreground">
        <p>
          Cập nhật{" "}
          {new Intl.DateTimeFormat("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(s.updatedAt))}
        </p>
        <p>
          Số liệu theo ghi nhận của giáo viên, không phải xác nhận giao dịch từ
          ngân hàng. Nếu cần đối chiếu, vui lòng liên hệ giáo viên.
        </p>
      </footer>
    </article>
  );
}
