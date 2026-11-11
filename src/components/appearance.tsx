"use client";
import { useI18n } from "@/lib/i18n/client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Palette } from "lucide-react";
import { DEFAULT_THEME, themes } from "@/domain/appearance";
import { useStatementMutation } from "@/features/statements/shared";
import type { useAppearancePreview } from "@/lib/use-appearance-preview";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
export const AppearanceContext = createContext<
  ReturnType<typeof useAppearancePreview>
>({
  theme: DEFAULT_THEME,
  savedTheme: DEFAULT_THEME,
  previewTheme: () => undefined,
  commitTheme: () => undefined,
  cancelPreview: () => undefined,
});
export function AppearancePicker() {
  const { t } = useI18n();
  const {
    theme: choice,
    savedTheme,
    previewTheme,
    commitTheme,
    cancelPreview,
  } = useContext(AppearanceContext);
  const dirty = choice !== savedTheme;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [message, setMessage] = useState("");
  const mutation = useStatementMutation();
  useEffect(() => {
    if (!open || mutation.busy) return;
    function dismiss() {
      cancelPreview();
      setOpen(false);
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        dismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      dismiss();
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, mutation.busy, cancelPreview]);
  async function save() {
    setMessage("");
    const result = await mutation.run("/api/appearance", "PATCH", {
      theme: choice,
    });
    if (result) {
      commitTheme(choice);
      setMessage(
        t("Đã lưu giao diện. Áp dụng cho tài khoản của bạn trên các thiết bị."),
      );
    }
  }
  return (
    <div ref={root}>
      <Button
        ref={trigger}
        type="button"
        size="icon"
        variant="outline"
        title={t("Chọn theme")}
        aria-label={t("Chọn theme")}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={mutation.busy}
        onClick={() => {
          if (open) cancelPreview();
          else {
            setMessage("");
            mutation.clearError();
          }
          setOpen(!open);
        }}
      >
        <Palette aria-hidden="true" />
      </Button>
      {open && (
        <Card
          id={id}
          className="absolute inset-x-4 top-full z-30 mt-2 max-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] overflow-auto p-4 sm:left-auto sm:right-8 sm:w-[34rem] sm:p-5 lg:max-h-[calc(100dvh-7rem)]"
        >
          <h2 className="serif text-xl">{t("Giao diện của bạn")}</h2>
          <fieldset
            disabled={mutation.busy}
            className="mt-3 grid gap-2 sm:grid-cols-2"
          >
            <legend className="sr-only">{t("Chọn theme")}</legend>
            {themes.map((item) => (
              <label
                key={item.id}
                data-slot="theme-option"
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${choice === item.id ? "border-primary bg-accent-soft" : "border-border bg-card"}`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={item.id}
                  checked={choice === item.id}
                  onChange={() => {
                    previewTheme(item.id);
                    mutation.clearError();
                    setMessage("");
                  }}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0">
                  <strong className="block text-sm">{item.name}</strong>
                  <span aria-hidden="true" className="mt-1.5 flex gap-1">
                    {item.colors.map((color) => (
                      <span
                        key={color}
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                    {t(item.description)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t("Bấm chọn để xem thử ngay. Chỉ lưu khi bạn bấm Lưu giao diện.")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={mutation.busy || !dirty} onClick={save}>
              {mutation.busy ? t("Đang lưu…") : t("Lưu giao diện")}
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                disabled={mutation.busy}
                onClick={() => {
                  cancelPreview();
                  setMessage("");
                  mutation.clearError();
                }}
              >
                {t("Hủy xem trước")}
              </Button>
            )}
          </div>
          {mutation.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {mutation.error}
            </p>
          )}
          {(dirty || message) && (
            <p role="status" className="mt-3 text-sm text-primary">
              {dirty ? t("Đang xem trước, chưa lưu.") : message}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
