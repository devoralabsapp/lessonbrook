import "server-only";
import { createTransport } from "nodemailer";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema, requestIdSchema } from "@/domain";
import { shareTokenDocumentSchema } from "@/domain/firestore";
import { shareTokenSchema, type StatementEmailOptions } from "@/domain/sharing";
import { admin } from "@/lib/firebase/admin";
import { translator, type Locale } from "@/lib/i18n/core";
import { assertAccountWritable } from "./account-access";
import { AppError } from "./errors";
import { studentDto, userRef } from "./repository";
import { appOrigin } from "./session";
import { tokenHash } from "./sharing-repository";
import { statementDto } from "./statements-repository";

type Teacher = { uid: string; email?: string; email_verified?: boolean };

function gmailConfig(teacher: Teacher) {
  const env = process.env;
  const teacherEmails = (
    env.STATEMENT_EMAIL_TEACHER_WHITELIST ??
    env.STATEMENT_EMAIL_TEACHER ??
    ""
  )
    .split(/[,\r\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => z.email().safeParse(email).success);
  if (
    env.FIREBASE_AUTH_EMULATOR_HOST ||
    env.FIRESTORE_EMULATOR_HOST ||
    !teacher.email_verified ||
    !teacher.email ||
    !teacherEmails.includes(teacher.email.toLowerCase())
  )
    return null;

  const sender = z.email().safeParse(env.STATEMENT_EMAIL_FROM?.trim());
  if (!sender.success) return null;
  const appPassword = env.STATEMENT_EMAIL_GMAIL_APP_PASSWORD?.replace(
    /\s/g,
    "",
  );
  if (appPassword)
    return /^[a-z0-9]{16}$/i.test(appPassword)
      ? { method: "smtp" as const, sender: sender.data, appPassword }
      : null;
  const clientId = env.STATEMENT_EMAIL_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.STATEMENT_EMAIL_GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = env.STATEMENT_EMAIL_GOOGLE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    method: "api" as const,
    sender: sender.data,
    clientId,
    clientSecret,
    refreshToken,
  };
}

export async function statementEmailOptions(
  teacher: Teacher,
  id: string,
): Promise<StatementEmailOptions> {
  const config = gmailConfig(teacher);
  if (!config) return { available: false };
  const root = userRef(teacher.uid);
  const statement = statementDto(
    await root.collection("statements").doc(idSchema.parse(id)).get(),
  );
  if (statement.status !== "issued" || !statement.activeShareTokenHash)
    return { available: false };
  const student = studentDto(
    await root.collection("students").doc(statement.studentId).get(),
  );
  return {
    available: true,
    recipient: student.email || null,
    sender: config.sender,
  };
}

class GmailDeliveryError extends Error {
  constructor(readonly safeToRetry: boolean) {
    super("Gmail delivery failed");
  }
}

async function deliver(
  config: NonNullable<ReturnType<typeof gmailConfig>>,
  recipient: string,
  subject: string,
  body: string,
) {
  if (config.method === "smtp") {
    try {
      await createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        tls: { minVersion: "TLSv1.2" },
        auth: { user: config.sender, pass: config.appPassword },
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 10_000,
      }).sendMail({
        from: { name: "LessonBrook", address: config.sender },
        to: { name: "", address: recipient },
        subject,
        text: body,
      });
      return;
    } catch (error) {
      const failure = z
        .object({
          code: z.string().optional(),
          responseCode: z.number().optional(),
        })
        .safeParse(error);
      // Explicit rejections or failures before DATA leave no message to deliver.
      // A disconnect during or after DATA can lose the acceptance response.
      const detail = failure.success ? failure.data : undefined;
      const rejected =
        detail?.responseCode !== undefined &&
        detail.responseCode >= 400 &&
        detail.responseCode < 600;
      throw new GmailDeliveryError(
        rejected || detail?.code === "EAUTH" || detail?.code === "EENVELOPE",
      );
    }
  }

  let accessToken: string;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GmailDeliveryError(true);
    accessToken = z
      .object({ access_token: z.string().min(1) })
      .parse(await response.json()).access_token;
  } catch {
    // The message has not been submitted to Gmail yet.
    throw new GmailDeliveryError(true);
  }

  const text =
    Buffer.from(body)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const raw = Buffer.from(
    [
      `From: <${config.sender}>`,
      `To: <${recipient}>`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      text,
      "",
    ].join("\r\n"),
  ).toString("base64url");
  let response: Response;
  try {
    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new GmailDeliveryError(false);
  }
  if (!response.ok)
    throw new GmailDeliveryError(
      response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408,
    );
}

const sendInput = z
  .object({ token: shareTokenSchema, recipient: z.email().max(254) })
  .strict();

export async function sendStatementEmail(
  teacher: Teacher,
  id: string,
  raw: unknown,
  requestId: string,
  locale: Locale,
) {
  const config = gmailConfig(teacher);
  if (!config)
    throw new AppError(
      403,
      "Gửi email bảng kê chưa được bật cho tài khoản này.",
    );
  idSchema.parse(id);
  requestIdSchema.parse(requestId);
  const { token, recipient } = sendInput.parse(raw);
  const hash = tokenHash(token);
  const origin = appOrigin();
  const { db } = admin();
  const root = userRef(teacher.uid);
  const tokenRef = db.collection("apps/chotcong/shareTokens").doc(hash);
  const statementRef = root.collection("statements").doc(id);
  const claim = await db.runTransaction(async (tx) => {
    await assertAccountWritable(tx, teacher.uid);
    const [statementDoc, tokenDoc] = await tx.getAll(statementRef, tokenRef);
    const statement = statementDto(statementDoc);
    const link = shareTokenDocumentSchema.safeParse(tokenDoc.data());
    if (
      !link.success ||
      link.data.ownerUid !== teacher.uid ||
      link.data.statementId !== id ||
      link.data.revokedAt ||
      link.data.expiresAt.toMillis() <= Date.now() ||
      statement.status !== "issued" ||
      statement.activeShareTokenHash !== hash
    )
      throw new AppError(
        409,
        "Link chia sẻ đã hết hiệu lực. Tạo link mới trước khi gửi email.",
      );

    if (link.data.emailDelivery) {
      if (link.data.emailDelivery.sentAt) {
        if (link.data.emailDelivery.requestId === requestId)
          return { sent: true } as const;
        throw new AppError(
          409,
          "Link này đã được gửi qua email. Tạo link mới nếu cần gửi lại.",
        );
      }
      throw new AppError(
        409,
        "Email đang gửi hoặc chưa xác nhận được. Kiểm tra thư đã gửi trong Gmail.",
      );
    }
    const student = studentDto(
      await tx.get(root.collection("students").doc(statement.studentId)),
    );
    if (student.email !== recipient)
      throw new AppError(
        409,
        "Email nhận bảng kê đã thay đổi. Tải lại trang để kiểm tra địa chỉ mới.",
      );
    tx.update(tokenRef, {
      emailDelivery: { requestId, attemptedAt: Timestamp.now(), sentAt: null },
    });
    return { sent: false, number: statement.number } as const;
  });
  if (claim.sent) return { id };
  const t = translator(locale);
  try {
    await deliver(
      config,
      recipient,
      t("Bảng kê học phí {0}", { "0": claim.number }),
      t("Bạn có thể xem bảng kê học phí qua link sau:\n\n{0}", {
        "0": `${origin}/s#${token}`,
      }),
    );
  } catch (error) {
    if (error instanceof GmailDeliveryError && error.safeToRetry) {
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(tokenRef);
        if (
          doc.get("emailDelivery.requestId") === requestId &&
          !doc.get("emailDelivery.sentAt")
        )
          tx.update(tokenRef, { emailDelivery: FieldValue.delete() });
      });
      throw new AppError(
        502,
        "Gmail chưa nhận email. Kiểm tra kết nối Gmail rồi thử lại.",
      );
    }
    // A timeout after submitting might still have delivered. Keep the claim to prevent duplicates.
    throw new AppError(
      502,
      "Chưa xác nhận được email đã gửi. Kiểm tra thư đã gửi trong Gmail.",
    );
  }
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(tokenRef);
    if (doc.get("emailDelivery.requestId") === requestId)
      tx.update(tokenRef, { "emailDelivery.sentAt": Timestamp.now() });
  });
  return { id };
}
