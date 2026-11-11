import { SessionDetail } from "@/features/schedule/session-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionDetail id={id} />;
}
