import { getI18n } from "@/lib/i18n/server";
import { type Metadata } from "next";
import { PublicShare } from "@/features/sharing/public-share";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Bảng kê học phí · LessonBrook"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
export default function Page() {
  return <PublicShare />;
}
