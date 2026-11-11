import { vietnamToday } from ".";
import type { WeeklySlot } from "./classes";
import { addBusinessDays } from "./statements";

export function vietnamLessonTime(date: string, time: string) {
  return Date.parse(`${date}T${time}:00+07:00`);
}

export function nextWeeklyLesson(slots: WeeklySlot[], after: Date) {
  if (!slots.length) return null;
  const today = vietnamToday(after);
  for (let offset = 0; offset <= 7; offset++) {
    const date = addBusinessDays(today, offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    const times = slots
      .filter((slot) => slot.weekday === weekday)
      .map((slot) => vietnamLessonTime(date, slot.time))
      .filter((time) => time > after.getTime());
    if (times.length) return new Date(Math.min(...times));
  }
  return null;
}
