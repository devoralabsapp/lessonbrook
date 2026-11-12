import { z, ZodError } from "zod";
import { dateSchema, requestIdSchema } from "@/domain";
import { createDemoWorkspace } from "@/features/demo/sample-data";
import { executeDemoCommand } from "@/features/demo/workspace";
import { translator } from "@/lib/i18n/core";
import { AppError } from "@/lib/server/errors";
import { json, jsonBody } from "@/lib/server/http";

export const runtime = "nodejs";

const command = z
  .object({
    path: z
      .string()
      .regex(/^\/api\/[a-z][\w/-]*(?:\?.*)?$/)
      .max(2000),
    method: z.enum(["GET", "POST", "PATCH"]),
    body: z.unknown().optional(),
    id: requestIdSchema,
    at: z.iso.datetime(),
  })
  .strict();
const payload = z
  .object({
    date: dateSchema.refine(
      (date) => date >= "2000-01-01" && date <= "2099-12-31",
    ),
    locale: z.enum(["en", "vi"]),
    command,
    changes: z.array(command).max(120),
  })
  .strict();

export async function POST(request: Request) {
  let locale: "en" | "vi" = "en";
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Yêu cầu phải là JSON.");
    const input = payload.parse(await jsonBody(request, 64 * 1024));
    locale = input.locale;
    const workspace = createDemoWorkspace(input.date);
    const results = new Map<string, unknown>();
    for (const change of input.changes) {
      if (
        change.method === "GET" ||
        change.path === "/api/share/resolve" ||
        results.has(change.id)
      )
        throw new AppError(400, "Dữ liệu demo không hợp lệ.");
      results.set(change.id, executeDemoCommand(workspace, change));
    }
    if (
      input.command.method !== "GET" &&
      input.command.path !== "/api/share/resolve" &&
      !results.has(input.command.id) &&
      input.changes.length >= 120
    )
      throw new AppError(409, "Tải lại demo để bắt đầu phiên mới.");
    const result =
      results.has(input.command.id) && input.command.method !== "GET"
        ? results.get(input.command.id)
        : executeDemoCommand(workspace, input.command);
    return json(result);
  } catch (error) {
    const t = translator(locale);
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    return json(
      {
        error: t(
          error instanceof AppError
            ? error.message
            : error instanceof ZodError
              ? (error.issues[0]?.message ?? "Dữ liệu demo không hợp lệ.")
              : "Không thể xử lý lúc này. Vui lòng thử lại.",
        ),
      },
      status,
    );
  }
}
