"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEFAULT_THEME, themes, type Theme } from "@/domain/appearance";
import { useI18n } from "@/lib/i18n/client";
import { Brand } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { Button } from "./ui/button";

export function HomeAppearance({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  return (
    <main
      data-theme={theme}
      className="min-h-dvh bg-background text-foreground"
    >
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7">
        <Brand />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Button asChild variant="outline">
            <Link href="/login">
              {t("Đăng nhập ")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <label className="flex w-full flex-col gap-1.5 text-sm font-semibold sm:flex-row sm:items-center sm:justify-end sm:gap-3 lg:w-auto">
          <span>{t("Xem thử giao diện")}</span>
          <span className="w-full sm:w-68 sm:shrink-0">
            <select
              className="select-input"
              value={theme}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const choice = themes.find((item) => item.id === value);
                if (choice) setTheme(choice.id);
              }}
            >
              {themes.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </span>
        </label>
      </header>
      {children}
    </main>
  );
}
