import { getI18n } from "@/lib/i18n/server";
import { type Metadata } from "next";
import { DeletionProgress } from "@/features/account/deletion-progress";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Tiến trình xóa tài khoản"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
export default function Page() {
  return <DeletionProgress />;
}
