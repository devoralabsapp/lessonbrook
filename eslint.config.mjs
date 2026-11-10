import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Auth changes intentionally reload the document to clear in-memory Auth and router data.
  {
    files: [
      "src/components/app-shell.tsx",
      "src/components/login-form.tsx",
      "src/components/settings-form.tsx",
      "src/features/account/delete-panel.tsx",
      "src/lib/client-api.ts",
    ],
    rules: { "@next/next/no-location-assign-relative-destination": "off" },
  },
  globalIgnores([
    ".next/**",
    ".local-tools/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
