import { SettingsForm } from "@/components/settings-form";
import { isMobileApp } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
import { appOrigin } from "@/lib/server/session";

export default async function Page() {
  const userAgent = (await headers()).get("user-agent");
  return (
    <SettingsForm
      inApp={isMobileApp(userAgent)}
      shortcutUrl={`${appOrigin()}/api/bank-notifications`}
    />
  );
}
