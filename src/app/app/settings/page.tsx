import { SettingsForm } from "@/components/settings-form";
import { isMobileApp } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";

export default async function Page() {
  return (
    <SettingsForm inApp={isMobileApp((await headers()).get("user-agent"))} />
  );
}
