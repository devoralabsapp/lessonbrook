import { notFound, redirect } from "next/navigation";
import Dashboard from "@/app/app/page";
import Students from "@/app/app/students/page";
import Student from "@/app/app/students/[id]/page";
import Classes from "@/app/app/classes/page";
import Class from "@/app/app/classes/[id]/page";
import Sessions from "@/app/app/sessions/page";
import Session from "@/app/app/sessions/[id]/page";
import Lessons from "@/app/app/lessons/page";
import Lesson from "@/app/app/lessons/[id]/page";
import NewLesson from "@/app/app/lessons/new/page";
import Schedule from "@/app/app/schedule/page";
import Statements from "@/app/app/statements/page";
import Statement from "@/app/app/statements/[id]/page";
import NewStatement from "@/app/app/statements/new/page";
import Appearance from "@/app/app/appearance/page";
import { SettingsForm } from "@/components/settings-form";
import { OnboardingGuide } from "@/features/onboarding/guide";
import { demoOnboarding } from "@/features/demo/workspace";
import { idSchema } from "@/domain";

type Query = {
  [key: string]: string | string[] | undefined;
  view?: string;
  status?: string;
  studentId?: string;
  billing?: string;
  classId?: string;
  mode?: string;
  date?: string;
  time?: string;
};

export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { path = [] } = await params;
  const [section, id] = path;
  if (!section) {
    const { view, status } = await searchParams;
    if (
      view === "students" ||
      view === "classes" ||
      view === "lessons" ||
      view === "statements"
    ) {
      const route = view === "lessons" ? "sessions" : view;
      redirect(
        `/demo/${route}${view === "statements" && typeof status === "string" ? `?status=${encodeURIComponent(status)}` : ""}`,
      );
    }
    return <Dashboard />;
  }
  if (path.length === 2 && idSchema.safeParse(id).success) {
    const detail = Promise.resolve({ id });
    switch (section) {
      case "students":
        return <Student params={detail} />;
      case "classes":
        return <Class params={detail} />;
      case "sessions":
        return <Session params={detail} />;
      case "lessons":
        return id === "new" ? (
          <NewLesson searchParams={searchParams} />
        ) : (
          <Lesson params={detail} />
        );
      case "statements":
        return id === "new" ? (
          <NewStatement searchParams={searchParams} />
        ) : (
          <Statement params={detail} />
        );
    }
  }
  if (path.length !== 1) notFound();
  switch (section) {
    case "students":
      return <Students />;
    case "classes":
      return <Classes />;
    case "sessions":
      return <Sessions searchParams={searchParams} />;
    case "lessons":
      return <Lessons />;
    case "schedule":
      return <Schedule />;
    case "statements":
      return <Statements searchParams={searchParams} />;
    case "appearance":
      return <Appearance />;
    case "settings":
      return <SettingsForm inApp={false} shortcutUrl="" />;
    case "onboarding":
      return <OnboardingGuide initial={demoOnboarding()} />;
    default:
      notFound();
  }
}
