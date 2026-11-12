import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  idSchema,
  profileSchema,
  requestIdSchema,
  sessionSchema,
  studentSchema,
} from ".";
import { statementSchema } from "./statements";
import { paymentSchema } from "./payments";
import { classSchema, lessonSchema } from "./classes";
import { appearanceSchema, storedThemeSchema } from "./appearance";
const timestamp = z.instanceof(Timestamp);
const timestamps = { createdAt: timestamp, updatedAt: timestamp };
export const appearanceDocumentSchema = appearanceSchema.extend({
  theme: storedThemeSchema,
  updatedAt: timestamp,
});
export const classDocumentSchema = classSchema.omit({ id: true }).extend({
  ...timestamps,
  archivedAt: timestamp.nullable(),
  nextLessonAt: timestamp.nullable().optional(),
});
export const lessonDocumentSchema = lessonSchema
  .omit({ id: true })
  .extend(timestamps);
export const profileDocumentSchema = profileSchema.extend(timestamps);
export const studentDocumentSchema = studentSchema
  .omit({ id: true })
  .extend({ ...timestamps, archivedAt: timestamp.nullable() });
export const sessionDocumentSchema = sessionSchema
  .omit({ id: true })
  .extend(timestamps);
export const statementDocumentSchema = statementSchema
  .omit({ id: true })
  .extend({
    ...timestamps,
    issuedAt: timestamp.nullable(),
    voidedAt: timestamp.nullable(),
  });
export const paymentDocumentSchema = paymentSchema.omit({ id: true }).extend({
  recordedAt: timestamp,
  updatedAt: timestamp.optional(),
  voidedAt: timestamp.nullable(),
});
export const shareTokenDocumentSchema = z
  .object({
    ownerUid: idSchema,
    statementId: idSchema,
    expiresAt: timestamp,
    revokedAt: timestamp.nullable(),
    emailDelivery: z
      .object({
        requestId: requestIdSchema,
        attemptedAt: timestamp,
        sentAt: timestamp.nullable(),
      })
      .strict()
      .optional(),
    createdAt: timestamp,
    schemaVersion: z.literal(1),
  })
  .strict();
