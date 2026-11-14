import { redirect } from "next/navigation";
import { requireWorkspaceReader } from "@/lib/server/workspace-cache";
import { AppError } from "@/lib/server/errors";
import { getOnboarding } from "@/lib/server/onboarding";
import { AppShell } from "@/components/app-shell";
import { OnboardingGuide } from "@/features/onboarding/guide";
import { getAppearance } from "@/lib/server/appearance";
import { hasNativeWorkspace } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page() {
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
  const [initial, appearance, requestHeaders] = await Promise.all([
    read("onboarding", [], () => getOnboarding(uid)),
    read("appearance", [], () => getAppearance(uid)),
    headers(),
  ]);
  return (
    <AppShell
      name={initial.profile.displayName}
      initialTheme={appearance.theme}
      embedded={hasNativeWorkspace(requestHeaders.get("user-agent"))}
    >
      <OnboardingGuide initial={initial} />
    </AppShell>
  );
}
