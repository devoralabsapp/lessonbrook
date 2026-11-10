import english from "./en.json";

export type Locale = "en" | "vi";
export const LOCALE_COOKIE = "chotcong_locale";
export const DEFAULT_LOCALE: Locale = "en";
export function parseLocale(value: unknown): Locale {
  return value === "vi" ? "vi" : DEFAULT_LOCALE;
}
export type Translator = (
  text: string,
  values?: Record<string, unknown>,
) => string;
const dictionary: Record<string, string> = english;
export function translator(locale: Locale): Translator {
  return (text, values) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    const translated =
      locale === "en" && Object.hasOwn(dictionary, normalized)
        ? `${text.match(/^\s*/)?.[0] ?? ""}${dictionary[normalized]}${text.match(/\s*$/)?.[0] ?? ""}`
        : text;
    return values
      ? translated.replace(/\{(\w+)\}/g, (match, key: string) =>
          Object.hasOwn(values, key) ? String(values[key]) : match,
        )
      : translated;
  };
}
