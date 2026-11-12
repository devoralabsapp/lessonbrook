import { formatVnd, TIME_ZONE } from "@/domain";
import { statementIsPaid, type Statement } from "@/domain/statements";
import { translator, type Locale } from "@/lib/i18n/core";

type EmailStatement = Pick<
  Statement,
  | "status"
  | "id"
  | "number"
  | "teacherSnapshot"
  | "recipientSnapshot"
  | "periodStart"
  | "periodEnd"
  | "issueDate"
  | "dueDate"
  | "items"
  | "totalVnd"
  | "paidVnd"
>;

export type StatementEmailContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function buildStatementEmail(
  statement: EmailStatement,
  {
    url,
    locale,
    expiresAt,
  }: { url: string; locale: Locale; expiresAt: string },
): StatementEmailContent {
  const t = translator(locale);
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "vi" ? "vi-VN" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE },
  );
  const date = (value: string) =>
    dateFormatter.format(new Date(`${value}T12:00:00+07:00`));
  const expiry = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(expiresAt));
  const money = (value: number) => formatVnd(value, locale);
  const remaining = statement.totalVnd - statement.paidVnd;
  const paid = statementIsPaid(statement);
  const number = statement.number ?? statement.id;
  const period = `${date(statement.periodStart)} – ${date(statement.periodEnd)}`;
  const introduction = t("{0} gửi bảng kê học phí của {1} cho kỳ {2}.", {
    "0": statement.teacherSnapshot.displayName,
    "1": statement.recipientSnapshot.displayName,
    "2": period,
  });
  const metadata = [
    [t("Tên học viên"), statement.recipientSnapshot.displayName],
    [t("Giáo viên"), statement.teacherSnapshot.displayName],
    [t("Mã bảng kê"), number],
    [t("Kỳ học"), period],
    ...(statement.issueDate
      ? [[t("Ngày phát hành"), date(statement.issueDate)]]
      : []),
    [t("Hạn thanh toán"), date(statement.dueDate)],
    [t("Số buổi học"), String(statement.items.length)],
  ];
  const totals = [
    [t("Tổng học phí"), money(statement.totalVnd)],
    [t("Học phí đã nhận"), money(statement.paidVnd)],
    [t("Còn phải thu"), money(remaining)],
  ];
  const lessons = [...statement.items].sort(
    (a, b) =>
      a.sessionDate.localeCompare(b.sessionDate) ||
      a.sessionId.localeCompare(b.sessionId),
  );
  const paymentMessage = paid
    ? t("Giáo viên đã ghi nhận đủ học phí cho bảng kê này. Cảm ơn bạn!")
    : t(
        "Mở bảng kê để xem thông tin chuyển khoản và mã QR nếu giáo viên đã thiết lập.",
      );
  const snapshotNote = t(
    "Số tiền trong email theo ghi nhận tại thời điểm gửi. Mở bảng kê để xem các khoản thanh toán mới nhất.",
  );
  const expiryNote = t("Link có hiệu lực đến {0} (giờ Việt Nam).", {
    "0": expiry,
  });
  const subject = t("Bảng kê học phí {0} · {1}", {
    "0": number,
    "1": statement.recipientSnapshot.displayName,
  });
  const text = [
    "LessonBrook",
    "",
    t("Xin chào,"),
    introduction,
    "",
    ...metadata.map(([label, value]) => `${label}: ${value}`),
    "",
    ...totals.map(([label, value]) => `${label}: ${value}`),
    "",
    t("Chi tiết các buổi học"),
    ...lessons.map(
      (item) => `${date(item.sessionDate)} · ${money(item.amountVnd)}`,
    ),
    "",
    paymentMessage,
    "",
    t("Xem bảng kê học phí"),
    url,
    "",
    snapshotNote,
    expiryNote,
    t("Nếu có thông tin cần điều chỉnh, vui lòng liên hệ giáo viên."),
  ].join("\n");

  const detailRows = metadata
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 0;color:#5a5248;font-size:14px;vertical-align:top;width:38%;">${escapeHtml(label)}</td>
      <td style="padding:8px 0 8px 12px;color:#211f1b;font-size:14px;font-weight:700;vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
    </tr>`,
    )
    .join("");
  const lessonRows = lessons
    .map(
      (item, index) => `
    <tr style="background:${index % 2 ? "#fff6e6" : "#fffdf7"};">
      <td style="padding:10px 12px;border-top:1px solid #e5ddcc;font-size:14px;">${escapeHtml(date(item.sessionDate))}</td>
      <td style="padding:10px 12px;border-top:1px solid #e5ddcc;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(money(item.amountVnd))}</td>
    </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fff6e6;color:#211f1b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(`${statement.recipientSnapshot.displayName} · ${t("Còn phải thu")} ${money(remaining)} · ${number}`)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6e6;">
    <tr><td align="center" style="padding:28px 12px;">
      <!--[if mso]><table role="presentation" width="640"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border:2px solid #211f1b;border-radius:20px;background:#fffdf7;box-shadow:4px 4px 0 #211f1b;overflow:hidden;table-layout:fixed;">
        <tr><td style="padding:22px 24px;border-bottom:2px solid #211f1b;background:#ffd02c;border-radius:18px 18px 0 0;">
          <div style="font-size:23px;font-weight:800;letter-spacing:-1px;">LessonBrook.</div>
          <p style="margin:8px 0 0;font-size:13px;line-height:20px;font-weight:700;">${escapeHtml(statement.teacherSnapshot.displayName)}</p>
        </td></tr>
        <tr><td style="padding:26px 24px 18px;">
          <p style="margin:0 0 8px;color:#5a5248;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(number)}</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:36px;letter-spacing:-0.6px;">${escapeHtml(t("Bảng kê học phí của bạn"))}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:24px;">${escapeHtml(t("Xin chào,"))}</p>
          <p style="margin:0;font-size:15px;line-height:24px;word-break:break-word;">${escapeHtml(introduction)}</p>
        </td></tr>
        <tr><td style="padding:0 24px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paid ? "#b8f0d0" : "#a9dcff"};border:2px solid #211f1b;border-radius:14px;table-layout:fixed;">
            <tr><td style="padding:20px 18px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;">${escapeHtml(paid ? t("Đã thu đủ") : t("Số tiền còn phải thanh toán"))}</p>
              <p style="margin:0;font-size:32px;line-height:40px;font-weight:800;letter-spacing:-0.8px;word-break:break-word;">${escapeHtml(money(remaining))}</p>
              <p style="margin:10px 0 0;font-size:13px;line-height:20px;">${escapeHtml(t("Hạn thanh toán"))} · ${escapeHtml(date(statement.dueDate))}</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            <tr><td style="padding:8px 0;font-size:14px;color:#5a5248;">${escapeHtml(t("Tổng học phí"))}</td><td style="padding:8px 0;font-size:15px;font-weight:700;text-align:right;">${escapeHtml(money(statement.totalVnd))}</td></tr>
            <tr><td style="padding:8px 0;font-size:14px;color:#5a5248;">${escapeHtml(t("Học phí đã nhận"))}</td><td style="padding:8px 0;font-size:15px;font-weight:700;text-align:right;color:#236341;">${escapeHtml(money(statement.paidVnd))}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 22px;">
          <h2 style="margin:0 0 10px;font-size:18px;line-height:26px;">${escapeHtml(t("Thông tin bảng kê"))}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${detailRows}</table>
        </td></tr>
        <tr><td style="padding:0 24px 24px;">
          <h2 style="margin:0 0 14px;font-size:18px;line-height:26px;">${escapeHtml(t("Chi tiết các buổi học"))}</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #211f1b;border-radius:10px;border-spacing:0;overflow:hidden;table-layout:fixed;">
            <thead><tr style="background:#ffd02c;">
              <th scope="col" style="padding:12px;font-size:13px;text-align:left;">${escapeHtml(t("Ngày học"))}</th>
              <th scope="col" style="padding:12px;font-size:13px;text-align:right;">${escapeHtml(t("Học phí"))}</th>
            </tr></thead>
            <tbody>${lessonRows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 28px;">
          <p style="margin:0 0 18px;font-size:14px;line-height:23px;">${escapeHtml(paymentMessage)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#ffd02c;border:2px solid #211f1b;border-radius:28px;">
            <a href="${escapeHtml(url)}" style="display:block;padding:15px 18px;color:#211f1b;text-decoration:none;font-size:15px;font-weight:800;line-height:22px;">${escapeHtml(t("Xem bảng kê học phí"))} &rarr;</a>
          </td></tr></table>
          <p style="margin:18px 0 8px;font-size:12px;line-height:20px;color:#5a5248;">${escapeHtml(t("Bạn cũng có thể mở link sau:"))}</p>
          <p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:#211f1b;text-decoration:underline;">${escapeHtml(url)}</a></p>
        </td></tr>
        <tr><td style="padding:20px 24px;background:#f6efdf;border-top:1px solid #ded5c2;border-radius:0 0 18px 18px;">
          <p style="margin:0 0 8px;font-size:12px;line-height:20px;color:#5a5248;">${escapeHtml(snapshotNote)}</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:20px;color:#5a5248;">${escapeHtml(expiryNote)}</p>
          <p style="margin:0;font-size:12px;line-height:20px;color:#5a5248;">${escapeHtml(t("Nếu có thông tin cần điều chỉnh, vui lòng liên hệ giáo viên."))}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}
