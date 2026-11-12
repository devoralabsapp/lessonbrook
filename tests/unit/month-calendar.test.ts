import { expect, it } from "vitest";
import { classSchema } from "@/domain/classes";
import { sessionSchema } from "@/domain";
import {
  classCalendarEntries,
  lessonCalendarEntries,
  monthBounds,
  monthCells,
  shiftMonth,
} from "@/domain/month-calendar";

it("builds Monday-first month grids including leap days, year rollover and supported range edges", () => {
  expect(monthBounds("2028-02")).toEqual({
    from: "2028-02-01",
    to: "2028-02-29",
  });
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  expect(monthCells("2026-11")[0]).toBe("2026-10-26");
  expect(monthCells("2026-11").at(-1)).toBe("2026-12-06");
  expect(monthCells("2028-02")).toContain("2028-02-29");
  expect(monthCells("1900-01")).toHaveLength(35);
  expect(monthCells("2100-12").at(-1)).toBe("2101-01-02");
});

it("projects weekly class times in Vietnam without timezone shifts, excluding archived and unscheduled classes", () => {
  const piano = classSchema.parse({
    id: "piano",
    displayName: "Piano",
    studentIds: ["a", "b"],
    rateVnd: 200000,
    weeklySchedule: [
      { weekday: 7, time: "20:00" },
      { weekday: 2, time: "00:15" },
      { weekday: 2, time: "18:00" },
    ],
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    schemaVersion: 1,
  });
  const entries = classCalendarEntries(
    [
      piano,
      { ...piano, id: "archived", archivedAt: "2026-01-01T00:00:00Z" },
      { ...piano, id: "unscheduled", weeklySchedule: [] },
    ],
    "2026-11",
  );
  expect(entries).toHaveLength(13);
  expect(
    entries
      .filter((entry) => entry.date === "2026-11-03")
      .map((entry) => entry.time),
  ).toEqual(["00:15", "18:00"]);
  expect(entries[0]).toMatchObject({
    date: "2026-11-01",
    time: "20:00",
    participants: 2,
    href: "/app/classes/piano",
  });
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  expect(classCalendarEntries([piano], "2100-12").length).toBeGreaterThan(0);
});

it("groups attendance rows per lesson, preserves mixed statuses and separates different meetings of the same class", () => {
  const row = sessionSchema.parse({
    id: "one",
    studentId: "a",
    studentName: "Alex",
    sessionDate: "2026-11-03",
    startTime: "20:00",
    durationMinutes: 60,
    status: "planned",
    billable: true,
    rateVnd: 200000,
    amountVnd: 0,
    privateNote: "",
    billedStatementId: null,
    requestId: "6fe55ac1-c18a-44a2-a1b3-86f38b8db8bd",
    schemaVersion: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  });
  const entries = lessonCalendarEntries([
    { ...row, lessonId: "group", classId: "piano", className: "Piano" },
    {
      ...row,
      id: "two",
      studentId: "b",
      status: "completed",
      lessonId: "group",
      classId: "piano",
      className: "Piano",
    },
    {
      ...row,
      id: "three",
      lessonId: "other-group",
      classId: "piano",
      sessionDate: "2026-11-10",
    },
    { ...row, id: "individual", startTime: null },
  ]);
  expect(entries).toHaveLength(3);
  expect(entries[0]).toMatchObject({
    id: "group",
    participants: 2,
    statuses: ["planned", "completed"],
    href: "/app/lessons/group",
  });
  expect(entries[1]).toMatchObject({
    id: "individual",
    href: "/app/sessions/individual",
    title: "Alex",
  });
  expect(entries[2].date).toBe("2026-11-10");
});
