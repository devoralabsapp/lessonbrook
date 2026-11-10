"use client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";

import Link from "next/link";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { InfoLinks } from "./info-links";
export function InfoLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-3"
      >
        {t("Đến nội dung")}
      </a>
      <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Brand compact />
        <LanguageSwitcher />
        <Button asChild variant="outline">
          <Link href="/app">{t("Mở sổ của bạn")}</Link>
        </Button>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-3xl px-5 py-8 sm:px-8"
      >
        <p className="mb-3 text-xs font-semibold tracking-widest text-primary">
          {t("SỔ BUỔI DẠY & HỌC PHÍ")}
        </p>
        <h1 className="serif text-3xl leading-tight sm:text-4xl">{t(title)}</h1>
        <p className="mb-8 mt-4 text-sm leading-7 text-muted-foreground">
          {t(description)}
        </p>
        <div className="info-content space-y-8 text-sm leading-7">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-3xl space-y-5 px-5 pb-10 pt-8 sm:px-8">
        <InfoLinks />
        <Link
          className="inline-block text-xs text-primary underline underline-offset-4"
          href="/"
        >
          {t("Về trang giới thiệu")}
        </Link>
      </footer>
    </div>
  );
}
