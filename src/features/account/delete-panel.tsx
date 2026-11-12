"use client";
import { useI18n } from "@/lib/i18n/client";

import { useRef, useState } from "react";
import Link from "next/link";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { DELETE_CONFIRMATION } from "@/domain/data";
import { clientAuth } from "@/lib/firebase/client";
import { api } from "@/lib/client-api";
import { useDemoWorkspace } from "@/components/workspace-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthReady } from "@/lib/firebase/use-auth-ready";
import { authErrorMessage } from "@/lib/firebase/auth-errors";
export function DeletePanel() {
  const { t } = useI18n();
  const confirmationPhrase = t(DELETE_CONFIRMATION);
  const [confirmation, setConfirmation] = useState(""),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false),
    requestId = useRef<string | null>(null);
  const demo = useDemoWorkspace();
  const preparation = useAuthReady(!demo);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      running.current ||
      (!demo && !preparation.ready) ||
      confirmation !== confirmationPhrase ||
      !acknowledged
    )
      return;
    if (demo) {
      setError(t("Đăng nhập để dùng tính năng này."));
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const auth = clientAuth();
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        await api("/api/account/deletion/start", {
          method: "POST",
          requestId: requestId.current,
          body: {
            confirmation,
            acknowledged,
            idToken: await result.user.getIdToken(),
          },
        });
      } finally {
        await signOut(auth);
      }
      window.location.assign("/account/deletion");
    } catch (error) {
      setError(authErrorMessage(error));
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 border-destructive/30 p-6">
      <h2 className="serif text-2xl">{t("Xóa tài khoản")}</h2>
      <p className="text-sm leading-6">
        {t(
          "Các học viên, buổi dạy, bảng kê, khoản thu và tài khoản đăng nhập sẽ được xóa vĩnh viễn. Link chia sẻ ngừng truy cập ngay khi yêu cầu bắt đầu. Sau khi xác nhận, bạn không thể hủy yêu cầu.",
        )}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {t(
          "Bạn có thể tải dữ liệu cần giữ ở phần trên. Sau xóa, hệ thống giữ dấu xác nhận kỹ thuật tối thiểu để ngăn yêu cầu cũ tạo lại dữ liệu.",
        )}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="flex items-start gap-3 text-sm leading-5">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            {t("Tôi đã tải dữ liệu cần giữ hoặc không cần giữ lại")}
          </label>
          <label className="field-label">
            {t("Nhập XÓA TÀI KHOẢN để xác nhận")}
            <Input
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              maxLength={40}
              required
            />
          </label>
          <Button
            className="h-auto max-w-full whitespace-normal py-3 text-center"
            variant="outline"
            type="submit"
            disabled={
              confirmation !== confirmationPhrase ||
              !acknowledged ||
              (!demo && !preparation.ready)
            }
          >
            {busy
              ? t("Đang xác nhận…")
              : t("Xác nhận bằng Google và xóa tài khoản")}
          </Button>
        </fieldset>
      </form>
      {(error || preparation.error) && (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>{t(error || preparation.error)}</p>
          {preparation.error && (
            <Button type="button" variant="outline" onClick={preparation.retry}>
              {t("Thử chuẩn bị lại")}
            </Button>
          )}
          {!demo && (
            <Link href="/account/deletion" className="underline">
              {t("Mở trang tiếp tục yêu cầu xóa")}
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
