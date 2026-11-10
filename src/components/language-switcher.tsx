"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Globe2, LoaderCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/core";

const languages: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

export function LanguageSwitcher() {
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = locale === "en" ? "Language" : "Ngôn ngữ";
  const selected = languages.findIndex((language) => language.value === locale);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  async function change(value: Locale) {
    setOpen(false);
    trigger.current?.focus();
    if (value === locale) return;
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

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      setActive(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? languages.length - 1
            : !open
              ? selected
              : (active +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  languages.length) %
                languages.length,
      );
    } else if (open && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      void change(languages[active].value);
    } else if (open && ["e", "t", "v"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      setActive(event.key.toLowerCase() === "e" ? 0 : 1);
    }
  }

  return (
    <div
      ref={container}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <Button
        ref={trigger}
        variant="outline"
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={id}
        aria-expanded={open}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-busy={busy}
        aria-describedby={error && !open ? `${id}-error` : undefined}
        disabled={busy}
        onKeyDown={keyDown}
        onClick={() => {
          setActive(selected);
          setOpen(!open);
        }}
        className="gap-2 px-3 text-xs font-medium"
      >
        <Globe2 aria-hidden="true" className="text-muted-foreground" />
        <span>{languages[selected].label}</span>
        {busy ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin text-muted-foreground"
          />
        ) : (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </Button>
      {open && (
        <ul
          id={id}
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 w-44 space-y-1 rounded-xl border border-border bg-card p-1.5 text-sm shadow-lg shadow-black/10"
        >
          {languages.map((language, index) => (
            <li key={language.value} role="presentation">
              <button
                id={`${id}-${index}`}
                type="button"
                role="option"
                aria-selected={language.value === locale}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => void change(language.value)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left transition-colors",
                  index === active
                    ? "bg-accent-soft text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span lang={language.value}>{language.label}</span>
                {language.value === locale && (
                  <Check
                    size={15}
                    aria-hidden="true"
                    className="text-primary"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && !open && (
        <p
          id={`${id}-error`}
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
