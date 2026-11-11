import { z } from "zod";
import type { Student, TeachingSession } from ".";
export const teacherSettingsSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Nhập tên giáo viên hoặc tên lớp.")
      .max(100),
    bankDetails: z.string().trim().max(500).optional(),
  })
  .strict();
export type OnboardingState = {
  profile: { displayName: string; bankDetails: string };
  profileConfirmed: boolean;
  student: Student | null;
  session: TeachingSession | null;
  completed: boolean;
};
