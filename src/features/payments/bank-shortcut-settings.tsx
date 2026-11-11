"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TIME_ZONE } from "@/domain";
import { useStatementMutation } from "@/features/statements/shared";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";

type Connection = { accountLast4: string; expiresAt: string };

export function BankShortcutSettings({ url }: { url: string }) {
  const { t, locale } = useI18n();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [revision, setRevision] = useState(0);
  const [statusError, setStatusError] = useState("");
  const [token, setToken] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const key = useRef<{ accountNumber: string; secret: string } | null>(null);
  const mutation = useStatementMutation();

  useEffect(() => {
    let active = true;
    api<Connection | null>("/api/bank-shortcut")
      .then((data) => {
        if (!active) return;
        setConnection(data);
        setStatusError("");
      })
      .catch((error) => {
        if (active) setStatusError(error.message);
      });
    return () => {
      active = false;
    };
  }, [revision, t]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.busy) return;
    const accountNumber = String(
      new FormData(event.currentTarget).get("accountNumber"),
    ).trim();
    if (key.current?.accountNumber !== accountNumber) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      key.current = {
        accountNumber,
        secret: Array.from(bytes, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      };
    }
    const pending = key.current;
    const result = await mutation.run("/api/bank-shortcut", "POST", pending);
    if (result) {
      setToken(`${result.id}.${pending.secret}`);
      setCopyMessage("");
      key.current = null;
      setRevision((n) => n + 1);
    }
  }

  async function disconnect() {
    if (await mutation.run("/api/bank-shortcut/disconnect", "POST", {})) {
      setConnection(null);
      setToken("");
      setCopyMessage("");
      key.current = null;
      setRevision((n) => n + 1);
    }
  }

  const expiry = connection && new Date(connection.expiresAt);
  return (
    <Card className="mt-6 space-y-4 p-6">
      <h2 className="serif text-xl">{t("Phím tắt nhận tiền trên iPhone")}</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          "Gửi nguyên văn thông báo nhận tiền. LessonBrook ghi nhận chuyển khoản khi tài khoản, mã chuyển khoản và khoản còn thiếu đều khớp. Ghi nhận tiền mặt trong bảng kê.",
        )}
      </p>
      {connection && expiry && (
        <p className="text-sm">
          {t("Tài khoản nhận tiền đuôi {0} · Phiên kết nối hết hạn {1}.", {
            "0": connection.accountLast4,
            "1": new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: TIME_ZONE,
            }).format(expiry),
          })}
        </p>
      )}
      <form onSubmit={connect} className="space-y-3">
        <label className="field-label">
          {t("Số tài khoản trong thông báo")}
          <Input
            name="accountNumber"
            disabled={mutation.busy}
            inputMode="numeric"
            pattern="[0-9]{6,32}"
            maxLength={32}
            required
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mutation.busy}>
            {connection ? t("Tạo lại khóa Phím tắt") : t("Tạo khóa Phím tắt")}
          </Button>
          {connection && (
            <Button
              type="button"
              variant="outline"
              onClick={disconnect}
              disabled={mutation.busy}
            >
              {t("Ngắt kết nối")}
            </Button>
          )}
        </div>
      </form>
      {(mutation.error || statusError) && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error || statusError}
        </p>
      )}
      {token && (
        <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <label className="field-label">
            {t("Giá trị cho header Authorization")}
            <Input
              readOnly
              value={`Bearer ${token}`}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`Bearer ${token}`);
                setCopyMessage(t("Đã sao chép khóa."));
              } catch {
                setCopyMessage(
                  t("Hãy chọn và sao chép khóa trong ô phía trên."),
                );
              }
            }}
          >
            {t("Sao chép khóa")}
          </Button>
          {copyMessage && <p role="status">{copyMessage}</p>}
          <p>
            {t(
              "Khóa chỉ hiển thị lần này. Tạo khóa mới sẽ vô hiệu hóa khóa cũ.",
            )}
          </p>
        </div>
      )}
      <div className="space-y-2 text-sm">
        <p>
          {t(
            "Trong Phím tắt, dùng Lấy nội dung của URL với phương thức POST và nội dung JSON. Đặt nguyên văn thông báo vào trường message.",
          )}
        </p>
        <code className="block break-all">{url}</code>
        <code className="block">{'{ "message": "…" }'}</code>
      </div>
    </Card>
  );
}
