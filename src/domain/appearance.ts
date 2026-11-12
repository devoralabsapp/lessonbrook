import { z } from "zod";
export const themeSchema = z.enum([
  "playful-retro",
  "mono-os",
  "chapter-desk",
  "afterhours-fm",
  "margin-notes",
  "sticker-sprint",
]);
export type Theme = z.infer<typeof themeSchema>;
export const DEFAULT_THEME: Theme = "playful-retro";
// Read saved choices from older releases without accepting them on writes.
export const storedThemeSchema = z.union([
  themeSchema,
  z
    .enum([
      "modern",
      "vintage",
      "art",
      "natura",
      "ocean",
      "command-line",
      "visual-code",
    ])
    .transform(() => DEFAULT_THEME),
]);
export const GUEST_THEME_COOKIE = "chotcong_guest_theme";
export const themes: {
  id: Theme;
  name: string;
  description: string;
  colors: string[];
}[] = [
  {
    id: "playful-retro",
    name: "Playful Retro Neo-Brutalism",
    description: "Nền kem, pastel rực rỡ, viền đen và bóng đổ retro",
    colors: ["#fff6e6", "#ffdb57", "#ffb7ce", "#aad7f5", "#baf0d1"],
  },
  {
    id: "mono-os",
    name: "Mono OS",
    description: "Giao diện máy tính xám trắng, chữ monospace và viền mảnh",
    colors: ["#d9d9d9", "#ffffff", "#111111"],
  },
  {
    id: "chapter-desk",
    name: "Chapter Desk",
    description: "Bàn đọc sách màu kem và điểm nhấn cam đất",
    colors: ["#f4e9d5", "#fff5e2", "#a34018"],
  },
  {
    id: "afterhours-fm",
    name: "Afterhours FM",
    description: "Nền than đen, chữ sáng và điểm nhấn vàng",
    colors: ["#101010", "#1d1d1d", "#f7d449", "#71d6c8"],
  },
  {
    id: "margin-notes",
    name: "Margin Notes",
    description: "Giấy ấm, tiêu đề serif và mực tím mận",
    colors: ["#f0e9df", "#fffcf5", "#713346", "#ded8eb"],
  },
  {
    id: "sticker-sprint",
    name: "Sticker Sprint",
    description: "Nền chấm, vàng hướng dương và bóng đổ đậm",
    colors: ["#fff8ec", "#ffd34e", "#bdebd9", "#ded2f9"],
  },
];
export const appearanceInputSchema = z.object({ theme: themeSchema }).strict();
export const appearanceSchema = appearanceInputSchema.extend({
  schemaVersion: z.literal(1),
});
