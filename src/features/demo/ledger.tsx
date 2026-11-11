"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ReceiptText,
  School,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/themed-select";
import { formatVnd, statusLabels } from "@/domain";
import { normalizeSearch, statementFilterLabels } from "@/domain/list-filters";
import { formatDate } from "@/features/statements/shared";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { DemoData } from "./sample-data";

const tabs = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "students", label: "Học viên", icon: Users },
  { id: "classes", label: "Lớp học", icon: School },
  { id: "lessons", label: "Buổi dạy", icon: CalendarDays },
  { id: "statements", label: "Bảng kê", icon: ReceiptText },
] as const;

const lessonTypes = {
  individual: "Buổi cá nhân",
  group: "Buổi nhóm",
  class: "Lớp học",
} as const;
const statementStates = [
  "paid",
  "partial",
  "unpaid",
  "overdue",
  "draft",
  "void",
] as const;
const activity = { active: "Đang hoạt động", archived: "Đã lưu trữ" };

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "good" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-lg border border-current px-2 py-1 text-xs font-bold",
        tone === "good"
          ? "status-completed"
          : tone === "warning"
            ? "status-planned"
            : tone === "danger"
              ? "bg-danger-soft text-destructive"
              : "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function DemoRow({
  title,
  subtitle,
  end,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 marker:hidden hover:bg-muted sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <strong className="block break-words">{title}</strong>
          {subtitle && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        {end}
        <ChevronDown
          className="size-4 shrink-0 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-3 bg-surface px-4 py-4 text-sm sm:px-5">
        {children}
      </div>
    </details>
  );
}

export function DemoLedger({
  data,
  view,
  initialStatus,
}: {
  data: DemoData;
  view?: string;
  initialStatus?: string;
}) {
  const { t, locale } = useI18n();
  const current = tabs.find((tab) => tab.id === view) ?? tabs[0];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(
    current.id === "statements" &&
      statementStates.some((item) => item === initialStatus)
      ? initialStatus!
      : "all",
  );
  const [type, setType] = useState("all");
  const money = (amount: number) => formatVnd(amount, locale);
  const date = (value: string) => formatDate(value, locale);
  const text = normalizeSearch(search);
  const matching = (...values: string[]) =>
    values.some((value) => normalizeSearch(value).includes(text));
  const activityMatches = (archived: boolean) =>
    status === "all" || archived === (status === "archived");
  const students = data.students.filter(
    (student) => matching(student.name) && activityMatches(student.archived),
  );
  const classes = data.classes.filter(
    (item) =>
      matching(t(item.name), ...item.students.map((student) => student.name)) &&
      activityMatches(item.archived),
  );
  const lessons = data.lessons.filter(
    (lesson) =>
      matching(
        t(lesson.className ?? lessonTypes[lesson.type]),
        ...lesson.students.map((student) => student.name),
      ) &&
      (status === "all" ||
        (status === "free"
          ? lesson.status === "completed" && !lesson.rate
          : status === lesson.status)) &&
      (type === "all" || type === lesson.type),
  );
  const statements = data.statements.filter(
    (statement) =>
      matching(statement.number, statement.student.name) &&
      (status === "all" || status === statement.status),
  );
  const counts = {
    students: data.students.length,
    classes: data.classes.length,
    lessons: data.lessons.length,
    statements: data.statements.length,
  };
  const filters =
    current.id === "statements"
      ? statementStates.map((value) => ({
          value,
          label: t(statementFilterLabels[value]),
        }))
      : current.id === "lessons"
        ? [
            ...Object.entries(statusLabels).map(([value, label]) => ({
              value,
              label: t(label),
            })),
            { value: "free", label: t("Miễn phí") },
          ]
        : Object.entries(activity).map(([value, label]) => ({
            value,
            label: t(label),
          }));
  const rowCount = {
    students: students.length,
    classes: classes.length,
    lessons: lessons.length,
    statements: statements.length,
  };
  const outstanding = data.statements.filter(({ status }) =>
    ["partial", "unpaid", "overdue"].includes(status),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="serif text-4xl sm:text-5xl">{t("Sổ dạy học mẫu")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Dữ liệu hư cấu để bạn xem và lọc trong bản demo.")}
          </p>
        </div>
      </header>
      <nav
        aria-label={t("Điều hướng bản demo")}
        className="flex flex-wrap gap-2 pt-3"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            asChild
            size="sm"
            variant={id === current.id ? "default" : "outline"}
          >
            <Link
              href={id === "dashboard" ? "/demo" : `/demo?view=${id}`}
              aria-current={id === current.id ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              {t(label)}
            </Link>
          </Button>
        ))}
      </nav>
      {current.id === "dashboard" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {tabs.slice(1).map(({ id, label, icon: Icon }, index) => (
              <Card
                key={id}
                data-tone={["yellow", "mint", "blue", "pink"][index]}
              >
                <Link
                  className="block rounded-2xl p-4 sm:p-5"
                  href={`/demo?view=${id}`}
                >
                  <Icon className="mb-3 size-5" aria-hidden="true" />
                  <strong className="serif block text-3xl">
                    {counts[id as keyof typeof counts]}
                  </strong>
                  <span className="text-sm">{t(label)}</span>
                </Link>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="space-y-3 p-5">
              <h2 className="serif text-xl">{t("Còn phải thu")}</h2>
              <p className="text-2xl font-bold">
                {money(
                  outstanding.reduce(
                    (sum, statement) => sum + statement.total - statement.paid,
                    0,
                  ),
                )}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/demo?view=statements&status=overdue">
                  {t("Quá hạn")}
                </Link>
              </Button>
            </Card>
            <Card className="space-y-3 p-5">
              <h2 className="serif text-xl">{t("Lịch dạy sắp tới")}</h2>
              <ul className="space-y-2 text-sm">
                {data.lessons
                  .filter((lesson) => lesson.status === "planned")
                  .map((lesson) => (
                    <li
                      key={lesson.id}
                      className="flex flex-wrap justify-between gap-x-3"
                    >
                      <strong>
                        {lesson.className
                          ? t(lesson.className)
                          : lesson.students[0].name}
                      </strong>
                      <span>
                        {date(lesson.date)} · {lesson.time}
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        </>
      ) : (
        <section aria-label={t(current.label)} className="space-y-4">
          <Card
            className={cn(
              "grid gap-3 p-4",
              current.id === "lessons" ? "sm:grid-cols-3" : "sm:grid-cols-2",
            )}
          >
            <label className="field-label">
              {t("Tìm trong danh sách")}
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="field-label">
              <span>{t("Trạng thái")}</span>
              <ThemedSelect
                label={t("Trạng thái")}
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: t("Tất cả trạng thái") },
                  ...filters,
                ]}
              />
            </div>
            {current.id === "lessons" && (
              <div className="field-label">
                <span>{t("Loại buổi học")}</span>
                <ThemedSelect
                  label={t("Loại buổi học")}
                  value={type}
                  onChange={setType}
                  options={[
                    { value: "all", label: t("Tất cả") },
                    ...Object.entries(lessonTypes).map(([value, label]) => ({
                      value,
                      label: t(label),
                    })),
                  ]}
                />
              </div>
            )}
          </Card>
          <p role="status" className="text-sm font-semibold">
            {t("{0} / {1} kết quả", {
              "0": rowCount[current.id],
              "1": counts[current.id],
            })}
          </p>
          <Card className="divide-y divide-border overflow-hidden">
            {current.id === "students" &&
              students.map((student) => (
                <DemoRow
                  key={student.id}
                  title={student.name}
                  end={
                    <Badge>
                      {t(
                        student.archived ? activity.archived : activity.active,
                      )}
                    </Badge>
                  }
                >
                  <p>
                    {t("Lớp học")} ·{" "}
                    {data.classes
                      .filter((item) =>
                        item.students.some(({ id }) => id === student.id),
                      )
                      .map((item) => t(item.name))
                      .join(", ")}
                  </p>
                  <p>
                    {t("Buổi dạy")} ·{" "}
                    {
                      data.lessons.filter((lesson) =>
                        lesson.students.some(({ id }) => id === student.id),
                      ).length
                    }
                  </p>
                </DemoRow>
              ))}
            {current.id === "classes" &&
              classes.map((item) => (
                <DemoRow
                  key={item.id}
                  title={t(item.name)}
                  subtitle={t("{0} học viên", { "0": item.students.length })}
                  end={
                    <Badge>
                      {t(item.archived ? activity.archived : activity.active)}
                    </Badge>
                  }
                >
                  {!!item.schedule.length && (
                    <p>
                      {t("Lịch học hằng tuần")} ·{" "}
                      {item.schedule
                        .map(({ day, time }) => `${t(day)} ${time}`)
                        .join(" · ")}
                    </p>
                  )}
                  <p>
                    {item.students.map((student) => student.name).join(", ")}
                  </p>
                </DemoRow>
              ))}
            {current.id === "lessons" &&
              lessons.map((lesson) => (
                <DemoRow
                  key={lesson.id}
                  title={
                    lesson.className
                      ? t(lesson.className)
                      : lesson.type === "group"
                        ? t("Buổi nhóm tự chọn")
                        : lesson.students[0].name
                  }
                  subtitle={`${date(lesson.date)} · ${lesson.time} · ${t(lessonTypes[lesson.type])}`}
                  end={
                    <Badge
                      tone={
                        lesson.status === "completed"
                          ? "good"
                          : lesson.status === "planned"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {t(statusLabels[lesson.status])}
                    </Badge>
                  }
                >
                  <p>
                    {lesson.students.map((student) => student.name).join(", ")}
                  </p>
                  <p>
                    {t("{0} phút", { "0": lesson.durationMinutes })}
                    {lesson.status === "completed"
                      ? ` · ${lesson.rate ? money(lesson.rate) : t("Miễn phí")}`
                      : ""}
                  </p>
                </DemoRow>
              ))}
            {current.id === "statements" &&
              statements.map((statement) => (
                <DemoRow
                  key={statement.number}
                  title={statement.number}
                  subtitle={`${statement.student.name} · ${money(statement.total)}`}
                  end={
                    <Badge
                      tone={
                        statement.status === "paid"
                          ? "good"
                          : statement.status === "partial"
                            ? "warning"
                            : ["unpaid", "overdue"].includes(statement.status)
                              ? "danger"
                              : undefined
                      }
                    >
                      {t(statementFilterLabels[statement.status])}
                    </Badge>
                  }
                >
                  <p>
                    {t("Ngày đến hạn")} · {date(statement.due)}
                  </p>
                  <ul className="space-y-2">
                    {statement.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap justify-between gap-x-3"
                      >
                        <span>
                          {date(item.date)} ·{" "}
                          {item.className
                            ? t(item.className)
                            : t(lessonTypes[item.type])}
                        </span>
                        <strong>{money(item.rate)}</strong>
                      </li>
                    ))}
                  </ul>
                  {statement.status !== "void" &&
                    statement.status !== "draft" && (
                      <p>
                        {t("Còn phải thu")} ·{" "}
                        <strong>
                          {money(statement.total - statement.paid)}
                        </strong>
                      </p>
                    )}
                  {!!statement.payments.length && (
                    <>
                      <h3 className="font-semibold">
                        {t("Lịch sử thanh toán")}
                      </h3>
                      <ul className="space-y-2">
                        {statement.payments.map((payment, index) => (
                          <li
                            key={index}
                            className="flex flex-wrap justify-between gap-x-3"
                          >
                            <span>
                              {date(payment.date)} ·{" "}
                              {t(
                                payment.method === "cash"
                                  ? "Tiền mặt"
                                  : "Chuyển khoản",
                              )}
                            </span>
                            <strong>{money(payment.amount)}</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </DemoRow>
              ))}
            {rowCount[current.id] === 0 && (
              <p className="p-5 text-sm text-muted-foreground">
                {t("Không có kết quả phù hợp.")}
              </p>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
