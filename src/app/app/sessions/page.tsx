import { Workspace } from "@/components/workspace";
import { billingFilterSchema } from "@/domain/list-filters";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const query = await searchParams;
  const billing = billingFilterSchema.safeParse(query.billing);
  return (
    <Workspace
      mode="sessions"
      initialBilling={
        billing.success && billing.data !== "billed" && billing.data !== "free"
          ? billing.data
          : "all"
      }
    />
  );
}
