"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { MOBILE_SCHEME } from "@/domain/mobile-sign-in";
import { clientAuth } from "@/lib/firebase/client";
import { authErrorMessage } from "@/lib/firebase/auth-errors";
import { useAuthReady } from "@/lib/firebase/use-auth-ready";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TIME_ZONE } from "@/domain";
import { useStatementMutation } from "@/features/statements/shared";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";

type Connection = {
  accountLast4: string;
  renewable: boolean;
  expiresAt: string | null;
};

export function BankShortcutSettings({
  url,
  inApp,
}: {
  url: string;
  inApp: boolean;
}) {
  const { t, locale } = useI18n();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [revision, setRevision] = useState(0);
  const [statusError, setStatusError] = useState("");
  const [token, setToken] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const key = useRef<{ accountNumber: string; secret: string } | null>(null);
  const mutation = useStatementMutation();
  const preparation = useAuthReady(!inApp);
  const confirming = useRef(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);

  async function authorize(
    path: string,
    body: { secret: string; accountNumber?: string },
  ) {
    if (confirming.current || !preparation.ready) return null;
    confirming.current = true;
    setBusy(true);
    setAuthError("");
    mutation.clearError();
    try {
      const auth = clientAuth();
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        return await api<{ id: string }>(path, {
          method: "POST",
          requestId: crypto.randomUUID(),
          body: { ...body, refreshToken: result.user.refreshToken },
        });
      } finally {
        await signOut(auth);
      }
    } catch (error) {
      setAuthError(authErrorMessage(error));
      return null;
    } finally {
      setBusy(false);
      confirming.current = false;
    }
  }

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
    if (busy || mutation.busy) return;
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
    const result = await authorize("/api/bank-shortcut", pending);
    if (result) {
      setToken(`${result.id}.${pending.secret}`);
      setCopyMessage("");
      key.current = null;
      setRevision((n) => n + 1);
    }
  }

  async function upgrade(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || mutation.busy) return;
    const entered = String(
      new FormData(event.currentTarget).get("authorization"),
    ).trim();
    const secret = /^(?:Bearer )?[a-f0-9]{64}\.([a-f0-9]{64})$/.exec(
      entered,
    )?.[1];
    if (!secret) {
      setAuthError("Dán giá trị Authorization đang dùng trong Phím tắt.");
      return;
    }
    if (await authorize("/api/bank-shortcut/upgrade", { secret })) {
      setShowUpgrade(false);
      setRevision((n) => n + 1);
    }
  }

  async function disconnect() {
    if (await mutation.run("/api/bank-shortcut/disconnect", "POST", {})) {
      setConnection(null);
      setShowUpgrade(false);
      setAuthError("");
      setToken("");
      setCopyMessage("");
      key.current = null;
      setRevision((n) => n + 1);
    }
  }

  const expiry = connection?.expiresAt && new Date(connection.expiresAt);
  return (
    <Card className="mt-6 space-y-4 p-6">
      <h2 className="serif text-xl">{t("Phím tắt nhận tiền trên iPhone")}</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          "Gửi nguyên văn thông báo nhận tiền. LessonBrook ghi nhận chuyển khoản khi tài khoản, mã chuyển khoản và khoản còn thiếu đều khớp. Ghi nhận tiền mặt trong bảng kê.",
        )}
      </p>
      {connection && (
        <p role="status" className="text-sm">
          {expiry
            ? t("Tài khoản nhận tiền đuôi {0} · Phiên kết nối hết hạn {1}.", {
                "0": connection.accountLast4,
                "1": new Intl.DateTimeFormat(
                  locale === "vi" ? "vi-VN" : "en-GB",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: TIME_ZONE,
                  },
                ).format(expiry),
              })
            : t("Tài khoản nhận tiền đuôi {0} · Tự động làm mới đã bật.", {
                "0": connection.accountLast4,
              })}
        </p>
      )}
      {inApp ? (
        <Button asChild variant="outline">
          <a href={`${MOBILE_SCHEME}://data`}>
            {t("Quản lý Phím tắt trong trình duyệt")}
          </a>
        </Button>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("Xác nhận Google một lần để Phím tắt tự làm mới phiên.")}
          </p>
          {connection && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || mutation.busy}
                onClick={() => {
                  setShowUpgrade((shown) => !shown);
                  setAuthError("");
                  mutation.clearError();
                }}
              >
                {t(
                  connection.renewable
                    ? "Kết nối lại với khóa hiện tại"
                    : "Bật tự động làm mới",
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={disconnect}
                disabled={busy || mutation.busy}
              >
                {t("Ngắt kết nối")}
              </Button>
            </div>
          )}
          {showUpgrade ? (
            <form onSubmit={upgrade} className="space-y-3">
              <label className="field-label">
                {t("Giá trị Authorization đang dùng trong Phím tắt")}
                <Input
                  name="authorization"
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={136}
                />
              </label>
              <Button
                type="submit"
                disabled={busy || mutation.busy || !preparation.ready}
              >
                {t("Xác nhận với Google")}
              </Button>
            </form>
          ) : (
            <form onSubmit={connect} className="space-y-3">
              <label className="field-label">
                {t("Số tài khoản trong thông báo")}
                <Input
                  name="accountNumber"
                  disabled={busy || mutation.busy}
                  inputMode="numeric"
                  pattern="[0-9]{6,32}"
                  maxLength={32}
                  required
                  autoComplete="off"
                />
              </label>
              <Button
                type="submit"
                disabled={busy || mutation.busy || !preparation.ready}
              >
                {t(connection ? "Tạo lại khóa Phím tắt" : "Tạo khóa Phím tắt")}
              </Button>
            </form>
          )}
          {preparation.error && (
            <Button variant="outline" onClick={preparation.retry}>
              {t("Thử lại")}
            </Button>
          )}
        </>
      )}
      {(authError || mutation.error || statusError || preparation.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t(authError || mutation.error || statusError || preparation.error)}
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
