export type UpcomingLesson = {
  id: string;
  kind: "individual" | "group" | "recurring";
  name: string | null;
  date: string;
  time: string | null;
};

export type UpcomingSchedule = {
  today: string;
  through: string;
  items: UpcomingLesson[];
  recurring?: UpcomingLesson[];
};

export function sortUpcomingLessons(items: UpcomingLesson[]) {
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "24:00").localeCompare(b.time ?? "24:00") ||
      a.id.localeCompare(b.id),
  );
}

export function upcomingLessonPath(lesson: UpcomingLesson) {
  if (lesson.kind === "recurring")
    return `/app/lessons/new?${new URLSearchParams({ classId: lesson.id, date: lesson.date, time: lesson.time ?? "" })}`;
  return `/app/${lesson.kind === "group" ? "lessons" : "sessions"}/${lesson.id}`;
}
