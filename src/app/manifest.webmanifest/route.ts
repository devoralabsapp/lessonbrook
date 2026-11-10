import { NextResponse } from "next/server";
import { createManifest } from "@/lib/i18n/manifest";
import { parseLocale } from "@/lib/i18n/core";
import { getI18n } from "@/lib/i18n/server";
export async function GET(request: Request) {
  // Manifest fetches omit cookies by default. The document includes its locale
  // in the URL so install metadata matches the page without sending credentials.
  const lang = new URL(request.url).searchParams.get("lang");
  const locale = lang === null ? (await getI18n()).locale : parseLocale(lang);
  return NextResponse.json(createManifest(locale), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "private, no-store",
    },
  });
}
