import { z } from "zod";

export const MOBILE_SCHEME = "tech.devoralabs.lessonbrook";
export const NATIVE_STATEMENT_SHARE = `${MOBILE_SCHEME}://share-statement`;
export const mobileProofSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function isMobileApp(userAgent: string | null) {
  return /\bLessonBrookApp\/(iOS|Android)\b/.test(userAgent ?? "");
}

export function hasNativeGoogleSignIn(userAgent: string | null) {
  return /\bLessonBrookApp\/iOS NativeGoogleSignIn\/1\b/.test(userAgent ?? "");
}

export function hasNativeWorkspace(userAgent: string | null) {
  return (
    isMobileApp(userAgent) && /\bNativeWorkspace\/1\b/.test(userAgent ?? "")
  );
}

export function hasNativeMobileActions(userAgent: string | null) {
  return (
    hasNativeWorkspace(userAgent) &&
    /\bMobileActions\/1\b/.test(userAgent ?? "")
  );
}

export function hasNativeChrome(userAgent: string | null) {
  return (
    hasNativeWorkspace(userAgent) && /\bNativeChrome\/1\b/.test(userAgent ?? "")
  );
}
