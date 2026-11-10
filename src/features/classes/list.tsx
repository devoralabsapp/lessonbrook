"use client";
import { useI18n } from "@/lib/i18n/client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatVnd } from "@/domain";
import type { TeachingClass } from "@/domain/classes";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClassForm } from "./class-form";
import { LoadError, usePaged } from "./shared";
export function ClassesList() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const term = useDebounced(search);
  const list = usePaged<TeachingClass>(
    `/api/classes?${new URLSearchParams({ q: term, archived: String(archived) })}`,
  );
  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("CÙNG HỌC, CÙNG TIẾN BỘ")}
          </p>
          <h1 className="serif text-3xl sm:text-4xl">{t("Lớp học")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Gom học viên vào lớp, ghi một buổi và tính học phí riêng từng người.",
            )}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>{t("Thêm lớp học")}</Button>
      </div>
      <Card className="space-y-4 p-5">
        <label className="field-label">
          {t("Tìm tên lớp")}
          <Input
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Có dấu hoặc không dấu")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="accent-primary"
          />
          {t("Hiện lớp đã lưu trữ")}
        </label>
      </Card>
      {list.error && <LoadError message={list.error} retry={list.reload} />}
      {!list.page && !list.error && (
        <p role="status">{t("Đang tải lớp học…")}</p>
      )}
      {list.page && (
        <Card className="divide-y divide-border">
          {list.page.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 p-5"
            >
              <Link href={`/app/classes/${item.id}`} className="min-w-0 flex-1">
                <h2 className="break-words font-semibold text-primary">
                  {item.displayName}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.studentIds.length}
                  {t(" học viên · ")}
                  {formatVnd(item.rateVnd, locale)} {t("/ người / buổi")}
                </p>
              </Link>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/classes/${item.id}`}>{t("Mở lớp")}</Link>
              </Button>
            </div>
          ))}
          {!list.page.items.length && (
            <div className="p-8 text-center">
              <h2 className="serif text-2xl">
                {list.page.nextCursor
                  ? t("Chưa thấy lớp phù hợp.")
                  : t("Chưa có lớp trong danh sách này.")}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "Thêm lớp từ các học viên đã có. Có thể bỏ chọn người vắng khi ghi buổi.",
                )}
              </p>
            </div>
          )}
        </Card>
      )}
      {list.page?.nextCursor && (
        <Button
          variant="outline"
          disabled={list.moreBusy || search !== term}
          onClick={list.more}
        >
          {list.moreBusy ? t("Đang tải…") : t("Tải tiếp lớp học")}
        </Button>
      )}
      {adding && (
        <ClassForm
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            router.push(`/app/classes/${id}`);
          }}
        />
      )}
    </div>
  );
}
