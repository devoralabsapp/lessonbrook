"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { ExportPanel } from "@/features/data/export-panel";
import { DeletePanel } from "@/features/account/delete-panel";
import { InfoLinks } from "./info-links";
import { AppearancePicker } from "./appearance";
export function SettingsForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<{
    displayName: string;
    bankDetails: string;
    email: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<{
    hash: string;
    id: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<typeof profile>("/api/profile")
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [t]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const body = {
      displayName: String(f.get("displayName")),
      bankDetails: String(f.get("bankDetails")),
    };
    const hash = JSON.stringify(body);
    if (request.current?.hash !== hash)
      request.current = { hash, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/api/profile", {
        method: "PATCH",
        body,
        requestId: request.current!.id,
      });
      setMessage(t("Đã lưu hồ sơ."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Chưa thể lưu."));
    } finally {
      setBusy(false);
    }
  }
  async function logout(allDevices: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST", body: { allDevices } });
      window.location.assign("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Chưa thể đăng xuất."));
      setBusy(false);
    }
  }
  return (
    <div className="max-w-xl">
      <p className="mb-2 text-xs text-muted-foreground">
        {t("KHÔNG GIAN CỦA BẠN")}
      </p>
      <h1 className="serif mb-7 text-4xl">{t("Cài đặt tài khoản")}</h1>
      <p className="mb-5 text-sm">
        <Link
          href="/onboarding"
          className="text-primary underline underline-offset-4"
        >
          {t("Xem hướng dẫn bắt đầu")}
        </Link>
      </p>
      <div className="mb-6">
        <InfoLinks />
      </div>
      <AppearancePicker />
      <Card className="p-6">
        {profile ? (
          <form onSubmit={submit} className="space-y-5">
            <p className="text-xs text-muted-foreground">{profile.email}</p>
            <label className="field-label">
              {t("Tên giáo viên / tên lớp")}
              <Input
                name="displayName"
                required
                maxLength={100}
                defaultValue={profile.displayName}
              />
            </label>
            <label className="field-label">
              {t("Thông tin nhận chuyển khoản (tùy chọn)")}
              <textarea
                className="select-input"
                name="bankDetails"
                rows={3}
                maxLength={500}
                defaultValue={profile.bankDetails}
              />
            </label>
            <p className="text-xs leading-6 text-muted-foreground">
              {t("Tiền tệ: VND · Múi giờ: Việt Nam.")}
              <br />
              {t("Sổ chỉ ghi nhận các buổi bạn nhập, chưa bao gồm nợ cũ.")}
            </p>
            <Button disabled={busy}>
              {busy ? t("Đang lưu…") : t("Lưu hồ sơ")}
            </Button>
          </form>
        ) : (
          !error && <p role="status">{t("Đang tải hồ sơ…")}</p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {t(error)}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 text-sm text-primary">
            {t(message)}
          </p>
        )}
      </Card>
      {profile && (
        <>
          <ExportPanel />
          <DeletePanel />
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={() => logout(false)}>
          {t("Đăng xuất")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => logout(true)}>
          {t("Đăng xuất mọi thiết bị")}
        </Button>
      </div>
    </div>
  );
}
