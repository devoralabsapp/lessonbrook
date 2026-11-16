import { Workspace } from "@/components/workspace";
import { headers } from "next/headers";
import { hasAndroidWorkspace } from "@/domain/mobile-sign-in";
import { MobileDashboard } from "@/features/schedule/mobile-dashboard";

export default async function Page() {
  return hasAndroidWorkspace((await headers()).get("user-agent")) ? (
    <MobileDashboard />
  ) : (
    <Workspace mode="overview" />
  );
}
