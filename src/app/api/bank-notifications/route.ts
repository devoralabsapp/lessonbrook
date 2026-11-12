import {
  bankNotificationSchema,
  parseBankNotification,
} from "@/domain/bank-notification";
import { verifyBankShortcut } from "@/lib/server/bank-shortcut";
import { AppError } from "@/lib/server/errors";
import { errorResponse, json, jsonBody } from "@/lib/server/http";
import { recordBankPayment } from "@/lib/server/payments-repository";

export const runtime = "nodejs";

function result(
  status:
    | "recorded"
    | "duplicate"
    | "unsupported_message"
    | "account_mismatch"
    | "missing_reference",
) {
  console.info(JSON.stringify({ event: "bank-notification", status }));
  return json({ status });
}

export async function POST(request: Request) {
  try {
    const shortcut = await verifyBankShortcut(
      request.headers.get("authorization"),
    );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Yêu cầu phải là JSON.");
    const { message } = bankNotificationSchema.parse(await jsonBody(request));
    const notification = parseBankNotification(message);
    if (!notification) return result("unsupported_message");
    if (notification.accountNumber !== shortcut.accountNumber)
      return result("account_mismatch");
    if (!notification.reference) return result("missing_reference");
    const payment = await recordBankPayment(
      shortcut.uid,
      shortcut.keyHash,
      notification.accountNumber,
      notification.reference,
      notification.amountVnd,
    );
    return result(payment.record ? "recorded" : "duplicate");
  } catch (error) {
    return errorResponse(error);
  }
}
