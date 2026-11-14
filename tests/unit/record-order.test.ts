import { describe, expect, it } from "vitest";
import {
  compareRecordKeys,
  studentOrderKey,
  lessonOrderKey,
  classOrderKey,
} from "@/domain/record-order";
import { classSchema } from "@/domain/classes";

const id = "00000000-0000-4000-8000-000000000001";
describe("workspace ordering", () => {
  it("uses Vietnamese alphabetical order for accents, Đ and case", () => {
    const names = ["Zoe", "Đan", "Bình", "Ân", "an", "Duy", "Ăn"];
    expect(
      names
        .map((displayName) => ({ id, displayName }))
        .sort((a, b) =>
          compareRecordKeys(studentOrderKey(a), studentOrderKey(b)),
        )
        .map((s) => s.displayName),
    ).toEqual(["an", "Ăn", "Ân", "Bình", "Duy", "Đan", "Zoe"]);
  });
  it("uses a strict ID tie-breaker for collator-equivalent IDs", () => {
    expect(
      compareRecordKeys(["An", "person01"], ["An", "person1"]),
    ).toBeLessThan(0);
    expect(
      compareRecordKeys(["An", "person1"], ["An", "person01"]),
    ).toBeGreaterThan(0);
  });
  it("orders times within a day, then puts lessons without a time last", () => {
    const lessons = [
      { id: "d", sessionDate: "2026-11-15", startTime: "08:00" },
      { id: "c", sessionDate: "2026-11-14", startTime: null },
      { id: "b", sessionDate: "2026-11-14", startTime: "20:00" },
      { id: "a", sessionDate: "2026-11-14", startTime: "08:00" },
    ];
    expect(
      lessons
        .sort((a, b) => compareRecordKeys(lessonOrderKey(a), lessonOrderKey(b)))
        .map((s) => s.id),
    ).toEqual(["a", "b", "c", "d"]);
  });
  it("orders classes by their next weekly slot, with unscheduled classes last", () => {
    const at = new Date("2026-11-16T00:00:00+07:00");
    const base = {
      id,
      displayName: "Class",
      studentIds: [id],
      rateVnd: 0,
      privateNote: "",
      archivedAt: null,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
      schemaVersion: 1,
    };
    const make = (time: string, weekday = 1) =>
      classSchema.parse({ ...base, weeklySchedule: [{ weekday, time }] });
    const early = make("08:00"),
      late = make("20:00"),
      nextDay = make("08:00", 2),
      unscheduled = classSchema.parse(base);
    const rows = [unscheduled, nextDay, late, early];
    expect(
      rows.sort((a, b) =>
        compareRecordKeys(classOrderKey(a, at), classOrderKey(b, at)),
      ),
    ).toEqual([early, late, nextDay, unscheduled]);
  });
});
