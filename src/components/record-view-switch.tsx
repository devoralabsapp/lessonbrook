"use client";

import { CalendarDays, List, StickyNote } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "./ui/button";

const views = [
  { value: "list", label: "Danh sách", Icon: List },
  { value: "notes", label: "Giấy ghi chú", Icon: StickyNote },
  { value: "month", label: "Lịch tháng", Icon: CalendarDays },
] as const;

export type RecordView = (typeof views)[number]["value"];

export function RecordViewSwitch({
  value,
  onChange,
  calendar = false,
  disabled = false,
}: {
  value: RecordView;
  onChange: (view: RecordView) => void;
  calendar?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      data-slot="record-view-switch"
      role="group"
      aria-label={t("Cách xem")}
      className="flex flex-wrap gap-2"
    >
      {views
        .filter((view) => calendar || view.value !== "month")
        .map(({ value: option, label, Icon }) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            aria-label={t(label)}
            title={t(label)}
            aria-pressed={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            <Icon aria-hidden="true" />
            <span className="hidden min-[420px]:inline">{t(label)}</span>
          </Button>
        ))}
    </div>
  );
}
