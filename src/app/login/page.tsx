import { getI18n } from "@/lib/i18n/server";
import { Suspense } from "react";
import { connection } from "next/server";
import { LoginForm } from "@/components/login-form";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { getGuestTheme } from "@/lib/server/guest-theme";
import { DEFAULT_THEME } from "@/domain/appearance";
export const runtime = "nodejs";
export default async function LoginPage() {
  await connection();
  const [{ t }, theme] = await Promise.all([getI18n(), getGuestTheme()]);
  return (
    <Suspense fallback={<p className="p-8">{t("Đang tải…")}</p>}>
      <LoginForm
        serverConfigured={hasFirebaseServerConfig()}
        theme={theme ?? DEFAULT_THEME}
      />
    </Suspense>
  );
}
