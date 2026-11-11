import { z } from "zod";

export const MOBILE_SCHEME = "tech.devoralabs.lessonbrook";
export const mobileProofSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function isMobileApp(userAgent: string | null) {
  return /\bLessonBrookApp\/(iOS|Android)\b/.test(userAgent ?? "");
}
