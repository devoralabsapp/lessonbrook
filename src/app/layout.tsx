import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";

import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
const playfulFont = localFont({
  src: "../assets/fonts/Nunito-Variable.ttf",
  variable: "--font-playful",
  weight: "200 1000",
  display: "swap",
  preload: false,
});
export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getI18n();
  return {
    title: {
      default: t("LessonBrook — Sổ buổi dạy & học phí"),
      template: "%s | LessonBrook",
    },
    description: t(
      "Sổ buổi dạy và học phí dành cho giáo viên tự do. Ghi từng buổi, giữ đúng đơn giá, nhẹ đầu cuối tháng.",
    ),
    manifest: `/manifest.webmanifest?lang=${locale}`,
    appleWebApp: {
      capable: true,
      title: "LessonBrook",
      statusBarStyle: "default",
    },
  };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#296447",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body className={playfulFont.variable}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
