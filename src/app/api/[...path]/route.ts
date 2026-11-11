import { getI18n } from "@/lib/i18n/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requestIdSchema } from "@/domain";
import { AppError } from "@/lib/server/errors";
import { getAppearance, saveAppearance } from "@/lib/server/appearance";
import {
  connectBankShortcut,
  disconnectBankShortcut,
  getBankShortcut,
  transferReferenceFor,
  upgradeBankShortcut,
} from "@/lib/server/bank-shortcut";
import {
  archiveClass,
  getClass,
  getLesson,
  initializeClassSchedules,
  listClasses,
  listLessons,
  materializeClassLessons,
  saveClass,
  saveLesson,
} from "@/lib/server/classes-repository";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import {
  getOnboarding,
  confirmOnboardingProfile,
} from "@/lib/server/onboarding";
import { requireUser, SESSION_COOKIE } from "@/lib/server/session";
import { getUpcomingSchedule } from "@/lib/server/upcoming-schedule";
import { exportPage, startExport } from "@/lib/server/data-export";
import {
  archiveStudent,
  getProfile,
  getSession,
  getStudent,
  listSessions,
  listStudents,
  saveSession,
  saveStudent,
  updateBankTransfer,
  updateProfile,
  getSummary,
} from "@/lib/server/repository";
import {
  amendStatement,
  createIssuedStatement,
  getStatement,
  issueStatement,
  listEligibleSessions,
  listStatements,
  saveStatementDraft,
  voidStatement,
} from "@/lib/server/statements-repository";
import {
  listPayments,
  recordPayment,
  updatePayment,
  voidPayment,
} from "@/lib/server/payments-repository";
import {
  createShare,
  getSharePreview,
  getShareStatus,
  revokeShare,
} from "@/lib/server/sharing-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function mobileWorkspace(uid: string) {
  const [summary, appearance, onboarding, { locale }, schedule] =
    await Promise.all([
      getSummary(uid),
      getAppearance(uid),
      getOnboarding(uid),
      getI18n(),
      getUpcomingSchedule(uid),
    ]);
  return {
    summary,
    theme: appearance.theme,
    displayName: onboarding.profile.displayName,
    needsOnboarding: !onboarding.completed,
    locale,
    schedule: {
      ...schedule,
      items: schedule.items.slice(0, 8),
      ...(schedule.recurring
        ? { recurring: schedule.recurring.slice(0, 8) }
        : {}),
    },
  };
}

async function handle(request: Request, context: Context) {
  try {
    const { uid, exp } = await requireUser();
    const { path } = await context.params;
    const [resource, id, action] = path;
    if (path.length > 3) throw new AppError(404, "Không tìm thấy chức năng.");
    if (request.method === "GET") {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      if (resource === "mobile" && id === "workspace" && path.length === 2) {
        z.object({}).strict().parse(query);
        return json(await mobileWorkspace(uid));
      }
      if (resource === "mobile" && id === "schedule" && path.length === 2) {
        z.object({}).strict().parse(query);
        return json(await getUpcomingSchedule(uid));
      }
      if (resource === "appearance" && path.length === 1) {
        z.object({}).strict().parse(query);
        return json(await getAppearance(uid));
      }
      if (resource === "classes" && path.length <= 2)
        return json(
          id ? await getClass(uid, id) : await listClasses(uid, query),
        );
      if (resource === "lessons" && path.length <= 2)
        return json(
          id ? await getLesson(uid, id) : await listLessons(uid, query),
        );
      if (resource === "onboarding" && path.length === 1) {
        z.object({}).strict().parse(query);
        return json(await getOnboarding(uid));
      }
      if (resource === "exports" && path.length === 2)
        return json(await exportPage(uid, id, query, (await getI18n()).locale));
      if (path.length === 1 && resource === "profile")
        return json(await getProfile(uid));
      if (path.length === 1 && resource === "bank-shortcut")
        return json(await getBankShortcut(uid));
      if (path.length === 1 && resource === "summary")
        return json(await getSummary(uid));
      if (resource === "statements" && path.length === 3) {
        if (action === "payments")
          return json(await listPayments(uid, id, query));
        if (action === "public-preview")
          return json(await getSharePreview(uid, id));
        if (action === "share") return json(await getShareStatus(uid, id));
      }
      if (resource === "statements" && path.length === 2 && id === "eligible")
        return json(await listEligibleSessions(uid, query));
      if (resource === "statements" && path.length <= 2) {
        if (!id) return json(await listStatements(uid, query));
        const statement = await getStatement(uid, id);
        return json({
          ...statement,
          transferReference:
            statement.status === "issued"
              ? transferReferenceFor(statement)
              : null,
        });
      }
      if (path.length <= 2 && resource === "students")
        return json(
          id ? await getStudent(uid, id) : await listStudents(uid, query),
        );
      if (path.length <= 2 && resource === "sessions")
        return json(
          id ? await getSession(uid, id) : await listSessions(uid, query),
        );
    } else {
      await checkMutation(request);
      const syncSchedule = resource === "class-schedule" && path.length === 1;
      const syncMobile =
        resource === "mobile" && id === "workspace" && path.length === 2;
      if ((syncSchedule || syncMobile) && request.method === "POST") {
        const { initialize } = z
          .object({ initialize: z.boolean() })
          .strict()
          .parse(await jsonBody(request));
        if (initialize) await initializeClassSchedules(uid);
        const result = await materializeClassLessons(uid);
        return json(syncMobile ? await mobileWorkspace(uid) : result);
      }
      const requestId = requestIdSchema.parse(
        request.headers.get("idempotency-key"),
      );
      const body = await jsonBody(request);
      if (
        resource === "profile" &&
        id === "bank-transfer" &&
        path.length === 2 &&
        request.method === "PATCH"
      )
        return json(await updateBankTransfer(uid, body, requestId));
      if (resource === "bank-shortcut" && request.method === "POST") {
        if (path.length === 1) {
          const session = (await cookies()).get(SESSION_COOKIE)?.value;
          if (!session)
            throw new AppError(
              401,
              "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
            );
          return json(
            await connectBankShortcut(
              uid,
              session,
              exp * 1000,
              body,
              requestId,
            ),
          );
        }
        if (path.length === 2 && id === "upgrade")
          return json(await upgradeBankShortcut(uid, body, requestId));
        if (path.length === 2 && id === "disconnect") {
          z.object({}).strict().parse(body);
          return json(await disconnectBankShortcut(uid, requestId));
        }
      }
      if (
        resource === "appearance" &&
        path.length === 1 &&
        request.method === "PATCH"
      )
        return json(await saveAppearance(uid, body, requestId));
      if (
        resource === "classes" &&
        path.length === 3 &&
        action === "archive" &&
        request.method === "POST"
      ) {
        const input = z.object({ archived: z.boolean() }).strict().parse(body);
        return json(await archiveClass(uid, id, input.archived, requestId));
      }
      if (
        resource === "onboarding" &&
        path.length === 1 &&
        request.method === "POST"
      )
        return json(await confirmOnboardingProfile(uid, body, requestId));
      if (
        resource === "exports" &&
        path.length === 1 &&
        request.method === "POST"
      )
        return json(await startExport(uid, body, requestId));
      if (request.method === "POST" && path.length === 3) {
        if (resource === "statements" && action === "payments")
          return json(await recordPayment(uid, id, body, requestId));
        if (resource === "payments" && action === "void")
          return json(await voidPayment(uid, id, body, requestId));
        if (resource === "statements" && action === "share")
          return json(await createShare(uid, id, body, requestId));
        if (resource === "statements" && action === "revoke-share")
          return json(await revokeShare(uid, id, body, requestId));
      }
      if (resource === "statements") {
        if (request.method === "POST" && path.length === 2 && id === "issue")
          return json(await createIssuedStatement(uid, body, requestId));
        if (request.method === "POST" && path.length === 3 && action === "publish")
          return json(await createIssuedStatement(uid, body, requestId, id));
        if (request.method === "PATCH" && path.length === 3 && action === "issued")
          return json(await amendStatement(uid, id, body, requestId));
        if (request.method === "POST" && path.length === 1)
          return json(await saveStatementDraft(uid, body, requestId));
        if (request.method === "PATCH" && path.length === 2)
          return json(await saveStatementDraft(uid, body, requestId, id));
        if (
          request.method === "POST" &&
          path.length === 3 &&
          action === "issue"
        )
          return json(await issueStatement(uid, id, body, requestId));
        if (request.method === "POST" && path.length === 3 && action === "void")
          return json(await voidStatement(uid, id, body, requestId));
      }
      if (
        resource === "payments" &&
        path.length === 2 &&
        request.method === "PATCH"
      )
        return json(await updatePayment(uid, id, body, requestId));
      if (
        resource === "profile" &&
        path.length === 1 &&
        request.method === "PATCH"
      )
        return json(await updateProfile(uid, body, requestId));
      if (
        resource === "students" &&
        path.length === 3 &&
        action === "archive" &&
        request.method === "POST"
      ) {
        const input = z.object({ archived: z.boolean() }).strict().parse(body);
        return json(await archiveStudent(uid, id, input.archived, requestId));
      }
      if (
        (request.method === "POST" && path.length === 1) ||
        (request.method === "PATCH" && path.length === 2)
      ) {
        if (resource === "students" || resource === "sessions") {
          const save = resource === "students" ? saveStudent : saveSession;
          const result = await save(uid, body, requestId, id);
          return json(
            request.headers.get("prefer") === "return=representation"
              ? result
              : { id: result.id },
          );
        }
        if (resource === "classes")
          return json(await saveClass(uid, body, requestId, id));
        if (resource === "lessons")
          return json(await saveLesson(uid, body, requestId, id));
      }
    }
    throw new AppError(404, "Không tìm thấy chức năng.");
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
