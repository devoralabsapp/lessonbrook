"use client";
import { useI18n } from "@/lib/i18n/client";

import Link from "next/link";
import { useDemoWorkspace } from "@/components/workspace-link";
import { useResource } from "@/features/classes/shared";
import { useEffect, useState } from "react";
import { formatVnd } from "@/domain";
import { type Statement } from "@/domain/statements";
import type {
  ShareResult,
  ShareStatus,
  StatementEmailOptions,
} from "@/domain/sharing";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStatementMutation } from "@/features/statements/shared";
import { NATIVE_STATEMENT_SHARE } from "@/domain/mobile-sign-in";
export function SharingPanel({
  statement,
  onChanged,
  nativeShare,
}: {
  statement: Statement;
  onChanged: () => void;
  nativeShare: boolean;
}) {
  const { t, locale } = useI18n();
  const demo = useDemoWorkspace();
  const [status, setStatus] = useState<{
    version: number;
    data: ShareStatus;
  } | null>(null);
  const [newLink, setNewLink] = useState<
    | (ShareResult & {
        url: string;
      })
    | null
  >(null);
  const [notice, setNotice] = useState("");
  const [emailedLink, setEmailedLink] = useState<string | null>(null);
  const [statusError, setStatusError] = useState("");
  const [revision, setRevision] = useState(0);
  const mutation = useStatementMutation();
  useEffect(() => {
    let active = true;
    api<ShareStatus>(`/api/statements/${statement.id}/share`)
      .then((data) => {
        if (active) {
          setStatus({ version: statement.version, data });
          setStatusError("");
        }
      })
      .catch((error) => {
        if (active) setStatusError(error.message);
      });
    return () => {
      active = false;
    };
  }, [statement.id, statement.version, revision, t]);
  const currentStatus =
    status?.version === statement.version ? status.data : null;
  const usableLink =
    newLink?.tokenHash === statement.activeShareTokenHash &&
    currentStatus?.active
      ? newLink
      : null;
  const emailEndpoint = `/api/statements/${statement.id}/share-email`;
  const emailOptions = useResource<StatementEmailOptions>(
    usableLink && !demo ? emailEndpoint : null,
  );
  const emailRecipient = emailOptions.data?.available
    ? emailOptions.data.recipient
    : null;
  const emailSent = !!usableLink && emailedLink === usableLink.tokenHash;
  async function sendEmail() {
    if (!usableLink?.token || !emailRecipient || emailSent) return;
    const result = await mutation.run(emailEndpoint, "POST", {
      token: usableLink.token,
      recipient: emailRecipient,
    });
    if (result) {
      setEmailedLink(usableLink.tokenHash);
      setNotice(t("Đã gửi link bảng kê qua Gmail."));
    }
  }
  async function create() {
    const result = await mutation.run<ShareResult>(
      `/api/statements/${statement.id}/share`,
      "POST",
      { version: statement.version },
    );
    if (result) {
      if (result.token) {
        setNewLink({
          ...result,
          url: `${window.location.origin}${demo ? "/demo/share" : "/s"}#${result.token}`,
        });
        setNotice(t("Đã tạo link mới. Link trước đó được thu hồi."));
      } else {
        setNewLink(null);
        setNotice(
          t(
            "Link đã được tạo ở lần lưu trước. Bấm Chia sẻ để tạo link mới nếu bạn cần sao chép.",
          ),
        );
      }
      onChanged();
    }
  }
  async function revoke() {
    const result = await mutation.run(
      `/api/statements/${statement.id}/revoke-share`,
      "POST",
      { version: statement.version },
    );
    if (result) {
      setNewLink(null);
      setNotice(t("Đã thu hồi link chia sẻ."));
      onChanged();
    }
  }
  const shareMessage = usableLink
    ? t(
        "{0} gửi bảng kê học phí {1} của {2}. Tổng học phí {3}, còn phải thu {4} theo ghi nhận của giáo viên. Xem chi tiết: {5}",
        {
          "0": statement.teacherSnapshot.displayName,
          "1": statement.number,
          "2": statement.recipientSnapshot.displayName,
          "3": formatVnd(statement.totalVnd, locale),
          "4": formatVnd(statement.totalVnd - statement.paidVnd, locale),
          "5": usableLink.url,
        },
      )
    : "";
  async function copy(message = false) {
    if (!usableLink) return;
    const text = message ? shareMessage : usableLink.url;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        message
          ? t("Đã sao chép nội dung để bạn tự gửi.")
          : t("Đã sao chép link."),
      );
    } catch {
      setNotice(
        t(
          "Chưa sao chép được. Bạn có thể chọn và sao chép link trong ô bên dưới.",
        ),
      );
    }
  }
  return (
    <Card className="space-y-5 p-5 sm:p-7">
      <h2 className="serif text-2xl">{t("Chia sẻ bảng kê")}</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {t("Kiểm tra thông tin trong bảng kê phía trên trước khi chia sẻ.")}{" "}
        {demo
          ? t("Link demo mở trong phiên hiện tại.")
          : t(
              "Ai có link đều xem được và có thể chuyển tiếp. Link chỉ đọc, hết hạn sau 30 ngày. Mỗi bảng kê có một link đang dùng; tạo link mới sẽ thu hồi link cũ.",
            )}
      </p>
      <p className="text-sm">
        {!currentStatus
          ? t("Đang kiểm tra trạng thái chia sẻ…")
          : currentStatus.active
            ? t("Đang bật chia sẻ · Hết hạn {0}", {
                "0": new Intl.DateTimeFormat(
                  locale === "vi" ? "vi-VN" : "en-GB",
                  { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium" },
                ).format(new Date(currentStatus.expiresAt!)),
              })
            : t("Chia sẻ đang tắt hoặc link đã hết hạn.")}
      </p>
      {statusError && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{t(statusError)}</p>
          <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
            {t("Tải lại trạng thái")}
          </Button>
        </div>
      )}
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {usableLink ? (
        <div className="space-y-3">
          <label className="field-label">
            {t("Link chia sẻ mới")}
            <Input
              readOnly
              value={usableLink.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {nativeShare && (
              <Button asChild>
                <a
                  href={NATIVE_STATEMENT_SHARE}
                  data-statement-share-url={usableLink.url}
                  data-statement-share-message={shareMessage}
                >
                  {t("Chia sẻ qua ứng dụng…")}
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => copy()}>
              {t("Sao chép link")}
            </Button>
            <Button variant="outline" onClick={() => copy(true)}>
              {t("Sao chép tin nhắn")}
            </Button>
            {demo ? (
              <Link
                className="py-3 text-sm text-primary"
                href={`/demo/share#${usableLink.token}`}
              >
                {t("Mở bảng kê công khai")}
              </Link>
            ) : (
              <a
                className="py-3 text-sm text-primary"
                href={usableLink.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t("Mở bảng kê công khai")}
              </a>
            )}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            {emailOptions.data?.available ? (
              emailRecipient ? (
                <p className="break-words text-sm">
                  {t("Gửi từ {0} đến {1}", {
                    "0": emailOptions.data.sender,
                    "1": emailRecipient,
                  })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Thêm email nhận bảng kê vào hồ sơ học viên để gửi.")}
                </p>
              )
            ) : emailOptions.error ? (
              <p role="alert" className="text-sm text-destructive">
                {t(emailOptions.error)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {demo
                  ? t("Demo không gửi email thật.")
                  : emailOptions.data
                    ? t("Gửi email bảng kê chưa được bật cho tài khoản này.")
                    : t("Đang kiểm tra địa chỉ nhận…")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!emailRecipient || mutation.busy || emailSent}
                onClick={sendEmail}
              >
                {emailSent ? t("Đã gửi email") : t("Gửi email")}
              </Button>
              {emailOptions.error && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={emailOptions.reload}
                >
                  {t("Thử tải lại")}
                </Button>
              )}
              {emailOptions.data?.available && !emailRecipient && (
                <Button asChild variant="ghost">
                  <Link href={`/app/students/${statement.studentId}`}>
                    {t("Mở hồ sơ học viên")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        currentStatus?.active && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Mã link gốc chỉ có ở lần tạo. Nếu đã đóng màn hình, bạn cần tạo link mới để sao chép; link cũ sẽ hết hiệu lực.",
            )}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={mutation.busy} onClick={create}>
          {mutation.busy
            ? t("Đang xử lý…")
            : currentStatus?.active
              ? t("Tạo link chia sẻ mới")
              : t("Chia sẻ")}
        </Button>
        {currentStatus?.active && (
          <Button variant="outline" disabled={mutation.busy} onClick={revoke}>
            {t("Thu hồi link")}
          </Button>
        )}
      </div>
    </Card>
  );
}
