export type UpcomingLesson = {
  id: string;
  kind: "individual" | "group";
  name: string | null;
  date: string;
  time: string | null;
};

export type UpcomingSchedule = {
  today: string;
  through: string;
  items: UpcomingLesson[];
};

export function upcomingLessonPath(lesson: UpcomingLesson) {
  return `/app/${lesson.kind === "group" ? "lessons" : "sessions"}/${lesson.id}`;
}
