import {
  bankNotificationSchema,
  parseBankNotification,
} from "@/domain/bank-notification";
import { verifyBankShortcut } from "@/lib/server/bank-shortcut";
import { AppError } from "@/lib/server/errors";
import { errorResponse, json, jsonBody } from "@/lib/server/http";
import { recordBankPayment } from "@/lib/server/payments-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const shortcut = await verifyBankShortcut(
      request.headers.get("authorization"),
    );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Yêu cầu phải là JSON.");
    const { message } = bankNotificationSchema.parse(await jsonBody(request));
    const notification = parseBankNotification(message);
    if (!notification) return json({ status: "unsupported_message" });
    if (notification.accountNumber !== shortcut.accountNumber)
      return json({ status: "account_mismatch" });
    if (!notification.reference) return json({ status: "missing_reference" });
    const result = await recordBankPayment(
      shortcut.uid,
      shortcut.keyHash,
      notification.reference,
      notification.amountVnd,
    );
    return json({ status: result.record ? "recorded" : "duplicate" });
  } catch (error) {
    return errorResponse(error);
  }
}
