import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { LessonForm } from "@/features/classes/lesson-form";
import { dateSchema, idSchema, lessonTimeSchema } from "@/domain";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    classId?: string;
    mode?: string;
    date?: string;
    time?: string;
  }>;
}) {
  const { t } = await getI18n();
  const { classId, mode, date, time } = await searchParams;
  const selectedClass = idSchema.safeParse(classId);
  const scheduledDate = dateSchema.safeParse(date);
  const scheduledTime = lessonTimeSchema.safeParse(time);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/app/sessions" className="text-sm text-primary underline">
        {t("← Buổi dạy")}
      </Link>
      <h1 className="serif text-3xl">{t("Ghi buổi nhóm/lớp")}</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(
          "Chọn người tham gia, ngày dạy và học phí mỗi người. Toàn bộ buổi được lưu cùng lúc.",
        )}
      </p>
      <LessonForm
        initialClassId={selectedClass.data}
        initialMode={typeof mode === "string" ? mode : "group"}
        scheduledSlot={
          selectedClass.success &&
          scheduledDate.success &&
          scheduledTime.success
            ? { date: scheduledDate.data, time: scheduledTime.data }
            : undefined
        }
      />
    </div>
  );
}
