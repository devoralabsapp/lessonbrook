import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { AppError } from "@/lib/server/errors";
import { getProfile } from "@/lib/server/repository";
import { AppShell } from "@/components/app-shell";
import { getAppearance } from "@/lib/server/appearance";
import { hasNativeWorkspace } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AppError && error.status === 423)
      redirect("/account/deletion");
    if (error instanceof AppError && error.status === 401)
      redirect("/login?expired=1");
    throw error;
  }
  const [profile, appearance, requestHeaders] = await Promise.all([
    getProfile(user.uid),
    getAppearance(user.uid),
    headers(),
  ]);
  return (
    <AppShell
      name={profile.displayName}
      initialTheme={appearance.theme}
      embedded={hasNativeWorkspace(requestHeaders.get("user-agent"))}
    >
      {children}
    </AppShell>
  );
}
