"use client";
import { createContext, useContext, useState } from "react";
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
  const {
    theme: choice,
    savedTheme,
    previewTheme,
    commitTheme,
    cancelPreview,
  } = useContext(AppearanceContext);
  const dirty = choice !== savedTheme;
  const [message, setMessage] = useState("");
  const mutation = useStatementMutation();
  async function save() {
    setMessage("");
    const result = await mutation.run("/api/appearance", "PATCH", {
      theme: choice,
    });
    if (result) {
      commitTheme(choice);
      setMessage(
        "Đã lưu giao diện. Áp dụng cho tài khoản của bạn trên các thiết bị.",
      );
    }
  }
  return (
    <Card className="mb-6 p-6">
      <h2 className="serif text-2xl">Giao diện của bạn</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Chọn màu sắc và kiểu chữ cho cuốn sổ. Bảng kê gửi cho người nhận giữ
        cách trình bày riêng.
      </p>
      <fieldset
        disabled={mutation.busy}
        className="mt-5 grid gap-3 sm:grid-cols-2"
      >
        <legend className="sr-only">Chọn theme</legend>
        {themes.map((item) => (
          <label
            key={item.id}
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
              <span aria-hidden="true" className="my-2 flex gap-1">
                {item.colors.map((color) => (
                  <span
                    key={color}
                    className="size-5 rounded-full border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {"Bấm chọn để xem thử ngay. Chỉ lưu khi bạn bấm Lưu giao diện."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={mutation.busy || !dirty} onClick={save}>
          {mutation.busy ? "Đang lưu…" : "Lưu giao diện"}
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
            {"Hủy xem trước"}
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
          {dirty ? "Đang xem trước, chưa lưu." : message}
        </p>
      )}
    </Card>
  );
}
