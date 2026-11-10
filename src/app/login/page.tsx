import { getI18n } from "@/lib/i18n/server";
import { Suspense } from "react";
import { connection } from "next/server";
import { LoginForm } from "@/components/login-form";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
export const runtime = "nodejs";
export default async function LoginPage() {
  const { t } = await getI18n();
  await connection();
  return (
    <Suspense fallback={<p className="p-8">{t("Đang tải…")}</p>}>
      <LoginForm serverConfigured={hasFirebaseServerConfig()} />
    </Suspense>
  );
}
