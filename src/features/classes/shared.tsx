"use client";
import { useI18n } from "@/lib/i18n/client";

import { useCallback, useEffect, useState } from "react";
import type { Student } from "@/domain";
import { MAX_CLASS_STUDENTS } from "@/domain/classes";
import { api } from "@/lib/client-api";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Page } from "@/features/statements/shared";
export function useResource<T>(endpoint: string | null) {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  const key = `${endpoint}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data: T;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    api<T>(endpoint)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((error) => {
        if (active)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : t("Chưa tải được dữ liệu."),
          });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  return {
    data: result?.key === key ? result.data : null,
    error: failure?.key === key ? failure.message : "",
    reload,
  };
}
export function usePaged<
  T extends {
    id: string;
  },
>(endpoint: string) {
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const key = `${endpoint}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    endpoint: string;
    page: Page<T>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api<Page<T>>(endpoint)
      .then((page) => {
        if (active) setResult({ key, endpoint, page });
      })
      .catch((error) => {
        if (active)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : t("Chưa tải được danh sách."),
          });
      });
    return () => {
      active = false;
    };
  }, [endpoint, key, t]);
  const page = result?.endpoint === endpoint ? result.page : null;
  const refreshing = !!page && result?.key !== key && failure?.key !== key;
  async function more() {
    if (!page?.nextCursor || moreBusy || result?.key !== key) return;
    setMoreBusy(true);
    try {
      const next = await api<Page<T>>(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setResult((prev) =>
        prev?.key === key
          ? {
              key,
              endpoint,
              page: {
                items: [
                  ...prev.page.items,
                  ...next.items.filter(
                    (s) => !prev.page.items.some((p) => p.id === s.id),
                  ),
                ],
                nextCursor: next.nextCursor,
              },
            }
          : prev,
      );
      setFailure((prev) => (prev?.key === key ? null : prev));
    } catch (error) {
      setFailure({
        key,
        message:
          error instanceof Error
            ? error.message
            : t("Chưa tải được trang tiếp."),
      });
    } finally {
      setMoreBusy(false);
    }
  }
  return {
    page,
    refreshing,
    more,
    moreBusy,
    error: failure?.key === key ? failure.message : "",
    reload: () => setRevision((v) => v + 1),
  };
}
export function LoadError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="my-4 rounded-xl border border-border p-4 text-sm"
    >
      <p className="mb-2 text-destructive">{t(message)}</p>
      <Button type="button" variant="outline" onClick={retry}>
        {t("Thử lại")}
      </Button>
    </div>
  );
}
export function MemberPicker({
  value,
  onChange,
}: {
  value: Student[];
  onChange: (students: Student[]) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const list = usePaged<Student>(
    `/api/students?limit=50&q=${encodeURIComponent(term)}`,
  );
  const chosen = new Set(value.map((s) => s.id));
  const visible = list.page?.items ?? [];
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-semibold">
        {t("Chọn học viên (")}
        {value.length}/{MAX_CLASS_STUDENTS})
      </legend>
      <Input
        type="search"
        aria-label={t("Tìm học viên để thêm")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        maxLength={100}
        placeholder={t("Tìm tên có dấu hoặc không dấu")}
      />
      {value.length > 0 && (
        <div
          aria-label={t("Học viên đã chọn")}
          className="flex flex-wrap gap-2"
        >
          {value.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => onChange(value.filter((item) => item.id !== s.id))}
              className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-primary"
              aria-label={t("Bỏ chọn {0}", { "0": s.displayName })}
            >
              {s.displayName}
              {t(" ×")}
              {s.archivedAt ? t(" · Lưu trữ") : ""}
            </button>
          ))}
        </div>
      )}
      {!list.page && !list.error && (
        <p role="status" className="text-xs">
          {t("Đang tải học viên…")}
        </p>
      )}
      {list.error && <LoadError message={list.error} retry={list.reload} />}
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
        {visible.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={chosen.has(s.id)}
              disabled={!chosen.has(s.id) && value.length >= MAX_CLASS_STUDENTS}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, s]
                    : value.filter((item) => item.id !== s.id),
                )
              }
              className="size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 break-words">{s.displayName}</span>
          </label>
        ))}
        {list.page && !visible.length && (
          <p className="p-2 text-xs text-muted-foreground">
            {list.page.nextCursor
              ? t("Chưa thấy kết quả, hãy tìm tiếp.")
              : t(
                  "Không có học viên phù hợp. Thêm học viên ở tab Học viên nếu cần.",
                )}
          </p>
        )}
      </div>
      {list.page?.nextCursor && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={list.moreBusy || search !== term}
          onClick={list.more}
        >
          {list.moreBusy ? t("Đang tải…") : t("Tải thêm học viên")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          "Chọn tối đa 50 học viên. Những người đã chọn được giữ khi tìm tên khác.",
        )}
      </p>
    </fieldset>
  );
}
