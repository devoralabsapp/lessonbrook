"use client";

import { useId, useState } from "react";
import { Globe2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/client-api";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { Locale } from "@/lib/i18n/core";

const languages = [
  { value: "en", label: "English", lang: "en" },
  { value: "vi", label: "Tiếng Việt", lang: "vi" },
] as const;

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const id = useId();

  async function change(value: Locale) {
    setBusy(true);
    setError(false);
    try {
      await api("/api/locale", { method: "POST", body: { locale: value } });
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <ThemedSelect
        label={locale === "en" ? "Language" : "Ngôn ngữ"}
        value={locale}
        options={languages}
        onChange={change}
        toolbar
        compact={compact}
        icon={<Globe2 aria-hidden="true" />}
        busy={busy}
        describedBy={error ? id : undefined}
      />
      {error && (
        <p
          id={id}
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-card p-3 text-xs leading-5 text-destructive shadow-lg shadow-black/10"
        >
          {locale === "en"
            ? "Could not change language. Try again."
            : "Chưa đổi được ngôn ngữ. Vui lòng thử lại."}
        </p>
      )}
    </div>
  );
}
