import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { requireWorkspaceReader } from "@/lib/server/workspace-cache";
import { AppError } from "@/lib/server/errors";
import { getProfile } from "@/lib/server/repository";
import { AppShell } from "@/components/app-shell";
import { getAppearance } from "@/lib/server/appearance";
import { hasNativeChrome, hasNativeWorkspace } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateViewport(): Promise<Viewport> {
  // Installed app versions also honor the workspace viewport limits.
  return hasNativeWorkspace((await headers()).get("user-agent"))
    ? { maximumScale: 1, userScalable: false }
    : {};
}

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let workspace;
  try {
    workspace = await requireWorkspaceReader();
  } catch (error) {
    if (error instanceof AppError && error.status === 423)
      redirect("/account/deletion");
    if (error instanceof AppError && error.status === 401)
      redirect("/login?expired=1");
    throw error;
  }
  const { uid, read } = workspace;
  const [profile, appearance, requestHeaders] = await Promise.all([
    read("profile", [], () => getProfile(uid)),
    read("appearance", [], () => getAppearance(uid)),
    headers(),
  ]);
  return (
    <AppShell
      name={profile.displayName}
      initialTheme={appearance.theme}
      embedded={hasNativeWorkspace(requestHeaders.get("user-agent"))}
      nativeChrome={hasNativeChrome(requestHeaders.get("user-agent"))}
    >
      {children}
    </AppShell>
  );
}
