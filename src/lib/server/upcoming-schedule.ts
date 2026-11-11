import "server-only";

import { sessionSchema, vietnamToday } from "@/domain";
import { addBusinessDays } from "@/domain/statements";
import { classSchema } from "@/domain/classes";
import {
  sortUpcomingLessons,
  type UpcomingLesson,
  type UpcomingSchedule,
} from "@/domain/upcoming-schedule";
import { userRef } from "./repository";

const scheduleSession = sessionSchema.pick({
  id: true,
  studentName: true,
  sessionDate: true,
  startTime: true,
  status: true,
  lessonId: true,
  className: true,
  classId: true,
});
const scheduleClass = classSchema.pick({
  id: true,
  displayName: true,
  weeklySchedule: true,
});

export async function getUpcomingSchedule(
  uid: string,
): Promise<UpcomingSchedule> {
  const today = vietnamToday();
  const through = addBusinessDays(today, 7);
  // Use the existing single-field date index. A group has one session per
  // participant, so keep one entry while at least one is still planned.
  const root = userRef(uid);
  const [sessions, classes] = await Promise.all([
    root
      .collection("sessions")
      .where("sessionDate", ">=", today)
      .where("sessionDate", "<=", through)
      .orderBy("sessionDate")
      .select(
        "studentName",
        "sessionDate",
        "startTime",
        "status",
        "lessonId",
        "className",
        "classId",
      )
      .get(),
    root
      .collection("classes")
      .where("archivedAt", "==", null)
      .select("displayName", "weeklySchedule")
      .get(),
  ]);
  const lessons = new Map<string, UpcomingLesson>();
  const recorded = new Set<string>();
  for (const doc of sessions.docs) {
    const session = scheduleSession.parse({ ...doc.data(), id: doc.id });
    if (session.classId && session.startTime)
      recorded.add(
        `${session.classId}:${session.sessionDate}:${session.startTime}`,
      );
    if (session.status !== "planned") continue;
    const kind = session.lessonId ? "group" : "individual";
    const id = session.lessonId ?? session.id;
    lessons.set(`${kind}:${id}`, {
      id,
      kind,
      name: session.lessonId
        ? (session.className ?? null)
        : session.studentName,
      date: session.sessionDate,
      time: session.startTime,
    });
  }
  const dates = Array.from({ length: 8 }, (_, index) => {
    const date = addBusinessDays(today, index);
    return { date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() || 7 };
  });
  const recurring: UpcomingLesson[] = [];
  for (const doc of classes.docs) {
    const item = scheduleClass.parse({ ...doc.data(), id: doc.id });
    for (const slot of item.weeklySchedule) {
      for (const { date, weekday } of dates) {
        if (
          weekday === slot.weekday &&
          !recorded.has(`${item.id}:${date}:${slot.time}`)
        ) {
          recurring.push({
            id: item.id,
            kind: "recurring",
            name: item.displayName,
            date,
            time: slot.time,
          });
        }
      }
    }
  }
  return {
    today,
    through,
    items: sortUpcomingLessons([...lessons.values()]),
    ...(recurring.length ? { recurring: sortUpcomingLessons(recurring) } : {}),
  };
}
