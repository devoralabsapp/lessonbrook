import { UpcomingScheduleView } from "@/features/schedule/upcoming";
import { headers } from "next/headers";
import { hasAndroidWorkspace } from "@/domain/mobile-sign-in";

export default async function Page() {
  return (
    <UpcomingScheduleView
      compact={hasAndroidWorkspace((await headers()).get("user-agent"))}
    />
  );
}
