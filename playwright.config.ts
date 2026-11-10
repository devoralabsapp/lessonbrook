import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3000",
    // Preserve Vietnamese regression coverage; i18n.spec.ts starts with a fresh English-default browser.
    storageState: {
      cookies: [
        {
          name: "chotcong_locale",
          value: "vi",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    viewport: { width: 360, height: 800 },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
