import { HomeAppearance } from "@/components/home-appearance";
import { DemoLedger } from "@/features/demo/ledger";
import { createDemoData } from "@/features/demo/sample-data";
import { getGuestTheme } from "@/lib/server/guest-theme";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const [theme, { view, status }] = await Promise.all([
    getGuestTheme(),
    searchParams,
  ]);
  return (
    <HomeAppearance initialTheme={theme}>
      <DemoLedger
        key={`${view}:${status}`}
        data={createDemoData()}
        view={view}
        initialStatus={status}
      />
    </HomeAppearance>
  );
}
