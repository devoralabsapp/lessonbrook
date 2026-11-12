import { AppShell } from "@/components/app-shell";
import { getGuestTheme } from "@/lib/server/guest-theme";
import { demoTeacherName } from "@/features/demo/sample-data";

export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell name={demoTeacherName} initialTheme={await getGuestTheme()}>
      {children}
    </AppShell>
  );
}
