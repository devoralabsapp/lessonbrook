"use client";
import { useI18n } from "@/lib/i18n/client";

import { useEffect, useRef, useState } from "react";
import { type Student } from "@/domain";
import { api } from "@/lib/client-api";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/themed-select";
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
export const formatDate = (date: string, locale: "en" | "vi" = "vi") =>
  locale === "vi"
    ? date.split("-").reverse().join("/")
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(`${date}T12:00:00+07:00`));
export function useStatementMutation() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{
    payload: string;
    id: string;
  } | null>(null);
  const running = useRef(false);
  async function run<
    T extends {
      id: string;
    } = {
      id: string;
    },
  >(path: string, method: string, body: unknown) {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify({ path, method, body });
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await api<T>(path, {
        method,
        body,
        requestId: request.current.id,
      });
      request.current = null;
      return result;
    } catch (error) {
      setError(
        (error instanceof TypeError
          ? t("Chưa kết nối được máy chủ.")
          : error instanceof Error
            ? error.message
            : t("Chưa thể lưu.")) + t(" Nội dung vẫn được giữ để bạn thử lại."),
      );
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, clearError: () => setError("") };
}
export function StudentPicker({
  value,
  onChange,
  optional = false,
  showSearch = true,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
  showSearch?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const endpoint = `/api/students?${new URLSearchParams({ archived: String(archived), limit: "50", q: term })}`;
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    key: string;
    page: Page<Student>;
  } | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [error, setError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const key = `${endpoint}:${revision}`;
  useEffect(() => {
    let active = true;
    api<Page<Student>>(endpoint)
      .then((page) => {
        if (active) setData({ key, page });
      })
      .catch((error) => {
        if (active) setError({ key, message: error.message });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  useEffect(() => {
    if (!value) return;
    let active = true;
    api<Student>(`/api/students/${encodeURIComponent(value)}`)
      .then((student) => {
        if (active) setSelected(student);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value, t]);
  const page = data?.key === key && search === term ? data.page : null;
  async function more() {
    if (!page?.nextCursor) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<Student>>(
        `${endpoint}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setData((current) =>
        current?.key === key
          ? {
              key,
              page: {
                items: [
                  ...current.page.items,
                  ...next.items.filter(
                    (student) =>
                      !current.page.items.some(
                        (existing) => existing.id === student.id,
                      ),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : current,
      );
    } catch (error) {
      setError({
        key,
        message:
          error instanceof Error ? error.message : t("Chưa tải được học viên."),
      });
    } finally {
      setMoreBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <ThemedSelect
        label={t("Học viên")}
        field
        value={value}
        onChange={(id) => {
          setSearch("");
          onChange(id);
        }}
        disabled={disabled}
        required={!optional}
        searchField={showSearch ? {
          label: t("Tìm tên học viên"),
          value: search,
          onChange: setSearch,
        } : undefined}
        options={[
          {
            value: "",
            label: optional ? t("Tất cả học viên") : t("Chọn học viên"),
          },
          ...(value && !page?.items.some((student) => student.id === value)
            ? [{
                value,
                label: selected?.id === value
                  ? selected.displayName
                  : t("Học viên đã chọn"),
              }]
            : []),
          ...(page?.items.map((student) => ({
            value: student.id,
            label:
              student.displayName +
              (student.archivedAt ? t(" · Đã lưu trữ") : ""),
          })) ?? []),
        ]}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={archived}
          disabled={disabled}
          data-draft-ignore
          onChange={(event) => setArchived(event.target.checked)}
        />
        {t("Hiện học viên đã lưu trữ")}
      </label>
      {!page && error?.key !== key && (
        <p role="status" className="text-xs">
          {t("Đang tải học viên…")}
        </p>
      )}
      {error?.key === key && (
        <div role="alert" className="text-xs text-destructive">
          {t(error.message)}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("Thử lại")}
          </Button>
        </div>
      )}
      {page && !page.items.length && (
        <p role="status" className="text-xs">
          {page.nextCursor
            ? t("Chưa thấy học viên phù hợp. Bạn có thể tìm tiếp.")
            : t("Không có học viên phù hợp trong danh sách này.")}
        </p>
      )}
      {page?.nextCursor && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={moreBusy}
          onClick={more}
        >
          {moreBusy
            ? t("Đang tải…")
            : term
              ? t("Tìm tiếp học viên")
              : t("Tải thêm học viên")}
        </Button>
      )}
    </div>
  );
}
