import { SettingsForm } from "@/components/settings-form";
import { hasNativeWorkspace, isMobileApp } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function Page() {
  const userAgent = (await headers()).get("user-agent");
  return (
    <>
      {hasNativeWorkspace(userAgent) && (
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
      )}
      <SettingsForm inApp={isMobileApp(userAgent)} />
    </>
  );
}
