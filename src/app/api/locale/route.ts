import { z } from "zod";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import { cookieOptions } from "@/lib/server/session";
import { LOCALE_COOKIE } from "@/lib/i18n/core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await checkMutation(request);
    const { locale } = z
      .object({ locale: z.enum(["en", "vi"]) })
      .strict()
      .parse(await jsonBody(request));
    const response = json({ locale });
    response.cookies.set(LOCALE_COOKIE, locale, {
      ...cookieOptions(),
      maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
