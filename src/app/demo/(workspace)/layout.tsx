import type { Viewport } from "next";
import { headers } from "next/headers";
import { hasNativeChrome, hasNativeWorkspace } from "@/domain/mobile-sign-in";
import { AppShell } from "@/components/app-shell";
import { getGuestTheme } from "@/lib/server/guest-theme";
import { demoTeacherName } from "@/features/demo/sample-data";

export async function generateViewport(): Promise<Viewport> {
  return hasNativeWorkspace((await headers()).get("user-agent"))
    ? { maximumScale: 1, userScalable: false }
    : {};
}

export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agent = (await headers()).get("user-agent");
  return (
    <AppShell
      name={demoTeacherName}
      initialTheme={await getGuestTheme()}
      embedded={hasNativeWorkspace(agent)}
      nativeChrome={hasNativeChrome(agent)}
    >
      {children}
    </AppShell>
  );
}
