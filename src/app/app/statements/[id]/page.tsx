import { StatementDetail } from "@/features/statements/detail";
import { hasNativeMobileActions } from "@/domain/mobile-sign-in";
import { headers } from "next/headers";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, requestHeaders] = await Promise.all([params, headers()]);
  return (
    <StatementDetail
      key={id}
      id={id}
      nativeShare={hasNativeMobileActions(requestHeaders.get("user-agent"))}
    />
  );
}
