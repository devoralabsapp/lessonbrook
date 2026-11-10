"use client";
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, translator, type Locale } from "./core";
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}
export function useI18n() {
  const locale = useContext(LocaleContext);
  const t = useMemo(() => translator(locale), [locale]);
  return { locale, t };
}
