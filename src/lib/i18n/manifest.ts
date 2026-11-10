import type { MetadataRoute } from "next";
import { translator, type Locale } from "./core";
export function createManifest(locale: Locale): MetadataRoute.Manifest {
  const t = translator(locale);
  return {
    name: t("LessonBrook — Sổ buổi dạy & học phí"),
    short_name: "LessonBrook",
    description: t("Sổ buổi dạy dành cho giáo viên tự do"),
    id: "/",
    scope: "/",
    start_url: "/app",
    display: "standalone",
    background_color: "#f7f8f3",
    theme_color: "#296447",
    lang: locale,
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
