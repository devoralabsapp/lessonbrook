import { z } from "zod";
import { idSchema, sessionAmount, type TeachingSession } from "@/domain";

export const MAX_SESSION_COMPLETION = 100;

export const sessionCompletionSchema = z
  .object({
    ids: z
      .array(idSchema)
      .min(1)
      .max(MAX_SESSION_COMPLETION)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Mỗi buổi chỉ được chọn một lần.",
      ),
  })
  .strict();

export const canCompleteSession = (session: TeachingSession) =>
  session.status === "planned" && session.billedStatementId === null;

export function completedSessionFields(session: TeachingSession) {
  const status = "completed" as const;
  return { status, amountVnd: sessionAmount({ ...session, status }) };
}
