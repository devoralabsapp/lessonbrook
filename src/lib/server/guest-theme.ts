import "server-only";
import { cookies } from "next/headers";
import { GUEST_THEME_COOKIE, themeSchema } from "@/domain/appearance";

export async function getGuestTheme() {
  const value = (await cookies()).get(GUEST_THEME_COOKIE)?.value;
  const result = themeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
