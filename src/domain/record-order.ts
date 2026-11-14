import type { Student, TeachingSession } from ".";
import type { TeachingClass } from "./classes";
import { nextWeeklyLesson } from "./weekly-schedule";

const alphabet = new Intl.Collator("vi", {
  sensitivity: "base",
  numeric: true,
});

export function compareRecordKeys(a: string[], b: string[]) {
  for (let index = 0; index < a.length - 1; index++) {
    const order = alphabet.compare(a[index], b[index]);
    if (order) return order;
  }
  // IDs are a strict tie-breaker, even when collation considers two IDs equal.
  const left = a.at(-1)!,
    right = b.at(-1)!;
  return left === right ? 0 : left < right ? -1 : 1;
}

export const studentOrderKey = (
  student: Pick<Student, "displayName" | "id">,
) => [student.displayName, student.id];

export const lessonOrderKey = (
  lesson: Pick<TeachingSession, "sessionDate" | "startTime" | "id">,
) => [lesson.sessionDate, lesson.startTime ?? "24:00", lesson.id];

export function classOrderKey(item: TeachingClass, at: Date) {
  return [
    nextWeeklyLesson(item.weeklySchedule, at)?.toISOString() ?? "9999-12-31",
    item.displayName,
    item.id,
  ];
}
