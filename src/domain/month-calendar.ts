import type { TeachingClass } from "./classes";
import type { SessionWithPayment } from "./list-filters";

export type CalendarEntry = {
  id: string;
  date: string;
  time: string | null;
  title: string | null;
  href: string;
  participants: number;
  statuses: Array<"planned" | "completed" | "cancelled">;
};

// Business dates are date-only values. UTC arithmetic avoids browser timezone/DST shifts.
export function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
  };
}

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export function monthCells(month: string) {
  const { from, to } = monthBounds(month);
  const mondayOffset = (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Number(to.slice(8));
  const length = Math.ceil((mondayOffset + days) / 7) * 7;
  return Array.from({ length }, (_, index) =>
    new Date(
      Date.parse(`${from}T00:00:00Z`) + (index - mondayOffset) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
  );
}

function sortEntries(entries: CalendarEntry[]) {
  return entries.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "24:00").localeCompare(b.time ?? "24:00") ||
      (a.title ?? "").localeCompare(b.title ?? "") ||
      a.id.localeCompare(b.id),
  );
}

export function classCalendarEntries(classes: TeachingClass[], month: string) {
  const entries: CalendarEntry[] = [];
  for (const date of monthCells(month).filter((day) => day.startsWith(month))) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    for (const item of classes) {
      if (item.archivedAt) continue;
      for (const slot of item.weeklySchedule) {
        if (slot.weekday !== weekday) continue;
        entries.push({
          id: `${item.id}:${date}:${slot.time}`,
          date,
          time: slot.time,
          title: item.displayName,
          href: `/app/classes/${item.id}`,
          participants: item.studentIds.length,
          statuses: [],
        });
      }
    }
  }
  return sortEntries(entries);
}

export function lessonCalendarEntries(sessions: SessionWithPayment[]) {
  const entries = new Map<string, CalendarEntry>();
  for (const session of sessions) {
    // Group/class attendance rows represent one lesson on the calendar.
    const id = session.lessonId ?? session.id;
    const entry = entries.get(id);
    if (entry) {
      entry.participants++;
      if (!entry.statuses.includes(session.status))
        entry.statuses.push(session.status);
    } else {
      entries.set(id, {
        id,
        date: session.sessionDate,
        time: session.startTime,
        title: session.lessonId
          ? (session.className ?? null)
          : session.studentName,
        href: session.lessonId
          ? `/app/lessons/${session.lessonId}`
          : `/app/sessions/${session.id}`,
        participants: 1,
        statuses: [session.status],
      });
    }
  }
  return sortEntries([...entries.values()]);
}
