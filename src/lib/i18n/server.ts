import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, translator } from "./core";
export async function getI18n() {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, t: translator(locale) };
}
