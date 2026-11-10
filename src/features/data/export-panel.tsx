"use client";
import { useI18n } from "@/lib/i18n/client";

import { useRef, useState } from "react";
import { vietnamToday } from "@/domain";
import {
  DATASETS,
  datasetLabels,
  MAX_DOWNLOAD_BYTES,
  type Dataset,
  type ExportPage,
} from "@/domain/data";
import { api, ApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
type Work = {
  choice: string;
  requestId: string;
  id?: string;
  index: number;
  cursor: string | null;
  csv: Partial<Record<Dataset, string[]>>;
  records: Partial<Record<Dataset, Record<string, unknown>[]>>;
  bytes: number;
  exportedAt?: string;
};
export function ExportPanel() {
  const { t, locale } = useI18n();
  const [choice, setChoice] = useState<Dataset | "all">("all");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const work = useRef<Work | null>(null),
    running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice(t("Đang chuẩn bị dữ liệu…"));
    if (work.current?.choice !== choice)
      work.current = {
        choice,
        requestId: crypto.randomUUID(),
        index: 0,
        cursor: null,
        csv: {},
        records: {},
        bytes: 0,
      };
    const current = work.current;
    const datasets: readonly Dataset[] = choice === "all" ? DATASETS : [choice];
    try {
      current.id ??= (
        await api<{
          id: string;
        }>("/api/exports", {
          method: "POST",
          body: { dataset: choice },
          requestId: current.requestId,
        })
      ).id;
      while (current.index < datasets.length) {
        const dataset = datasets[current.index];
        setNotice(
          t("Đang lấy {0}…", {
            "0": t(datasetLabels[dataset]).toLocaleLowerCase(locale),
          }),
        );
        const query = new URLSearchParams({
          dataset,
          limit: "25",
          ...(current.cursor ? { cursor: current.cursor } : {}),
        });
        const page = await api<ExportPage>(
          `/api/exports/${current.id}?${query}`,
        );
        const bytes =
          new TextEncoder().encode(page.csv).length +
          (choice === "all"
            ? new TextEncoder().encode(JSON.stringify(page.records)).length
            : 0);
        if (current.bytes + bytes > MAX_DOWNLOAD_BYTES) {
          work.current = null;
          throw new Error(
            t(
              "Dữ liệu quá lớn cho một lần tải. Bạn xuất từng loại CSV để giữ đủ dữ liệu nhé.",
            ),
          );
        }
        current.bytes += bytes;
        current.exportedAt = page.exportedAt;
        (current.csv[dataset] ??= []).push(page.csv);
        if (choice === "all")
          (current.records[dataset] ??= []).push(...page.records);
        current.cursor = page.nextCursor;
        if (!page.nextCursor) current.index++;
      }
      setNotice(t("Đang tạo tệp tải về…"));
      let blob: Blob, name: string;
      const date = vietnamToday(new Date(current.exportedAt!));
      if (choice === "all") {
        const { zipSync, strToU8 } = await import("fflate");
        const files: Record<string, Uint8Array> = {};
        for (const dataset of DATASETS)
          files[`${dataset}.csv`] = strToU8(
            "﻿" + current.csv[dataset]!.join(""),
          );
        files[locale === "en" ? "raw-data.json" : "du-lieu-goc.json"] = strToU8(
          JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: current.exportedAt,
              data: current.records,
            },
            null,
            2,
          ),
        );
        files[locale === "en" ? "README.txt" : "HUONG-DAN.txt"] = strToU8(
          t(
            "LessonBrook — Dữ liệu của bạn\nThời điểm dữ liệu (UTC): {0}\nCSV dùng UTF-8 và số nguyên VND. Ô văn bản có nguy cơ thành công thức được thêm dấu văn bản (tab). JSON giữ giá trị gốc.\nBao gồm lịch sử lưu trữ/hủy/vô hiệu hóa và ghi chú riêng. Hãy giữ tệp ở nơi an toàn.\nGói này phục vụ đối chiếu/lấy lại dữ liệu, không thay bản backup phục hồi Firestore.\n",
            { "0": current.exportedAt },
          ),
        );
        if (
          Object.values(files).reduce(
            (sum, bytes) => sum + bytes.byteLength,
            0,
          ) > MAX_DOWNLOAD_BYTES
        ) {
          work.current = null;
          throw new Error(
            t(
              "Gói dữ liệu quá lớn. Bạn xuất từng loại CSV để giữ đủ dữ liệu nhé.",
            ),
          );
        }
        const zipped = zipSync(files, { level: 1 });
        blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
        name = `lessonbrook-${locale === "en" ? "data" : "du-lieu"}-${date}.zip`;
      } else {
        blob = new Blob(["﻿", ...current.csv[choice]!], {
          type: "text/csv;charset=utf-8",
        });
        name = `lessonbrook-${choice}-${date}.csv`;
      }
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      work.current = null;
      setNotice(
        t("Đã tạo tệp tải về. Bạn kiểm tra tệp trước khi xóa tài khoản nhé."),
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 410 || error.status === 404)
      )
        work.current = null;
      setError(
        error instanceof TypeError || error instanceof SyntaxError
          ? t("Chưa nhận đủ phản hồi từ máy chủ. Bạn có thể thử tải lại.")
          : error instanceof Error
            ? error.message
            : t("Chưa tải được. Nội dung đã lấy được giữ để bạn thử lại."),
      );
      setNotice("");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="mt-6 space-y-4 p-6">
      <h2 className="serif text-2xl">{t("Lấy lại dữ liệu")}</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          "Tải các buổi dạy, học phí và lịch sử của bạn, kể cả dữ liệu đã lưu trữ hoặc hủy. Tệp có thông tin liên hệ và ghi chú riêng; hãy giữ ở nơi an toàn.",
        )}
      </p>
      <label className="field-label">
        {t("Loại dữ liệu")}
        <select
          className="select-input"
          disabled={busy}
          value={choice}
          onChange={(event) => setChoice(event.target.value as Dataset | "all")}
        >
          <option value="all">{t("Toàn bộ dữ liệu (ZIP)")}</option>
          {DATASETS.map((dataset) => (
            <option key={dataset} value={dataset}>
              {t(datasetLabels[dataset])} — CSV
            </option>
          ))}
        </select>
      </label>
      <Button variant="outline" disabled={busy} onClick={download}>
        {busy ? t("Đang tải dữ liệu…") : t("Tải dữ liệu về máy")}
      </Button>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
          {t(" Bấm tải lại để tiếp tục.")}
        </p>
      )}
    </Card>
  );
}
