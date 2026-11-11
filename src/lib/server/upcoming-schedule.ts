import "server-only";

import { sessionSchema, vietnamToday } from "@/domain";
import { addBusinessDays } from "@/domain/statements";
import type {
  UpcomingLesson,
  UpcomingSchedule,
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
});

export async function getUpcomingSchedule(
  uid: string,
): Promise<UpcomingSchedule> {
  const today = vietnamToday();
  const through = addBusinessDays(today, 7);
  // Use the existing single-field date index. A group has one session per
  // participant, so keep one entry while at least one is still planned.
  const sessions = await userRef(uid)
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
    )
    .get();
  const lessons = new Map<string, UpcomingLesson>();
  for (const doc of sessions.docs) {
    const session = scheduleSession.parse({ ...doc.data(), id: doc.id });
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
  const items = [...lessons.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "24:00").localeCompare(b.time ?? "24:00") ||
      a.id.localeCompare(b.id),
  );
  return { today, through, items };
}
