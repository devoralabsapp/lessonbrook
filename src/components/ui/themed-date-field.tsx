"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dateSchema, vietnamToday } from "@/domain";
import { monthCells, shiftMonth } from "@/domain/month-calendar";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export function ThemedDateField({
  label,
  value,
  onChange,
  name,
  required,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState<string | null>(null);
  const language = locale === "vi" ? "vi-VN" : "en-GB";
  const activeDate = dateSchema.safeParse(value).success
    ? value
    : vietnamToday();

  useLayoutEffect(() => {
    input.current?.setCustomValidity(
      value && !dateSchema.safeParse(value).success
        ? t("Ngày không hợp lệ (YYYY-MM-DD)")
        : "",
    );
  }, [t, value]);

  const open = month !== null;
  useLayoutEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  function openCalendar(button: HTMLButtonElement) {
    button.focus({ preventScroll: true });
    setMonth(activeDate.slice(0, 7));
  }

  function choose(date: string) {
    onChange(date);
    dialog.current?.close();
  }

  return (
    <div className={cn("field-label min-w-0", className)}>
      <label htmlFor={id}>{label}</label>
      <div
        data-slot="input"
        className="flex h-[42px] min-w-0 items-center rounded-xl border border-input bg-card shadow-xs focus-within:ring-2 focus-within:ring-ring"
      >
        <Input
          ref={input}
          id={id}
          type="text"
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          data-slot="date-input"
          className="h-full border-0 bg-transparent py-0 shadow-none focus-visible:ring-0 pointer-coarse:text-[calc(16px+var(--font-size-offset,0px))]"
        />
        <button
          type="button"
          aria-label={t("Mở lịch cho {0}", { "0": label })}
          aria-haspopup="dialog"
          disabled={disabled}
          className="grid h-full w-10 shrink-0 place-items-center rounded-lg text-primary hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          onClick={(event) => openCalendar(event.currentTarget)}
        >
          <CalendarDays className="size-4" />
        </button>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-calendar`}
        onClose={() => setMonth(null)}
        className="max-w-[min(22rem,calc(100vw-24px))] border border-border"
      >
        {month && (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={t("Tháng trước")}
                disabled={month === "1900-01"}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft />
              </Button>
              <h2
                id={`${id}-calendar`}
                aria-live="polite"
                className="text-center text-sm font-bold"
              >
                {new Intl.DateTimeFormat(language, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${month}-01T00:00:00Z`))}
              </h2>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={t("Tháng sau")}
                disabled={month === "2100-12"}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, index) => (
                <span
                  key={index}
                  className="text-center text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  {new Intl.DateTimeFormat(language, {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2024, 0, index + 1)))}
                </span>
              ))}
              {monthCells(month).map((day) =>
                day.startsWith(month) ? (
                  <button
                    key={day}
                    type="button"
                    data-date={day}
                    aria-label={day}
                    aria-pressed={day === value}
                    autoFocus={day === activeDate}
                    className="h-9 rounded-lg border border-transparent text-sm font-semibold hover:border-border hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    onClick={() => choose(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : (
                  <span key={day} />
                ),
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => choose(vietnamToday())}
              >
                {t("Hôm nay")}
              </Button>
              {!required && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => choose("")}
                >
                  {t("Xóa ngày")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => dialog.current?.close()}
              >
                {t("Đóng")}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
