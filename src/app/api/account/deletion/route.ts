import { cookies } from "next/headers";
import {
  advanceDeletion,
  DELETION_COOKIE,
  getDeletionStatus,
} from "@/lib/server/account-deletion";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import { z } from "zod";
import { AppError } from "@/lib/server/errors";
import { getI18n } from "@/lib/i18n/server";
const failure = async (error: unknown) =>
  error instanceof AppError && error.status === 401
    ? json({ error: (await getI18n()).t(error.message) }, 401)
    : errorResponse(error);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  try {
    return json(
      await getDeletionStatus((await cookies()).get(DELETION_COOKIE)?.value),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    await checkMutation(request);
    z.object({})
      .strict()
      .parse(await jsonBody(request));
    return json(
      await advanceDeletion((await cookies()).get(DELETION_COOKIE)?.value),
    );
  } catch (error) {
    return failure(error);
  }
}
