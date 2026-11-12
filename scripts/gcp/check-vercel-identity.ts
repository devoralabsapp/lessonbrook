import { randomUUID } from "node:crypto";

if (process.env.FIREBASE_APPLY_CONFIG) {
  try {
    const { applyFirestoreConfig } = await import("./apply-firestore-config");
    await applyFirestoreConfig();
  } catch {
    console.error(
      JSON.stringify({
        event: "firebase.cloud.preflight.failed",
        step: "apply-config",
        code: "config-apply-failed",
      }),
    );
    process.exit(1);
  }
}

// Local/CI builds stay on Emulator and never use a cloud credential.
if (
  process.env.VERCEL &&
  process.env.VERCEL_ENV === "production" &&
  process.env.FIREBASE_ADMIN_AUTH_MODE === "vercel-oidc"
) {
  let step = "configuration";
  const fail = (code: string | number): never => {
    console.error(
      JSON.stringify({ event: "firebase.cloud.preflight.failed", step, code }),
    );
    process.exit(1);
  };
  const deadline = setTimeout(() => fail("deadline-exceeded"), 45000);
  try {
    const { hasFirebaseServerConfig } =
      await import("../../src/lib/firebase/server-config");
    if (!hasFirebaseServerConfig()) fail("incomplete-config");
    const { admin } = await import("../../src/lib/firebase/admin");
    const { AggregateField, FieldPath } =
      await import("firebase-admin/firestore");
    const { auth, db } = admin();
    const probeUid = `connection-check-${randomUUID()}`;
    step = "token-exchange";
    const credential =
      auth.app.options.credential ?? fail("missing-credential");
    await credential.getAccessToken();

    step = "firebase-auth-read";
    // A random, nonexistent UID checks permission without creating a user.
    await auth.getUser(probeUid).catch((error: unknown) => {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "auth/user-not-found"
      ))
        throw error;
    });

    step = "firestore-read";
    // Check the app namespace root, never student/profile documents or writes.
    await db.doc("apps/chotcong").get();

    // Exercise the real query shapes in a random, nonexistent user namespace.
    // This checks production indexes without reading any user's records.
    const probe = db.doc(`apps/chotcong/users/${probeUid}`);
    step = "firestore-students-index";
    await probe
      .collection("students")
      .where("archivedAt", "==", null)
      .orderBy("displayName")
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();
    step = "firestore-sessions-index";
    await probe
      .collection("sessions")
      .where("studentId", "==", "connection-check")
      .orderBy("sessionDate", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(1)
      .get();
    step = "firestore-eligible-sessions-index";
    await probe
      .collection("sessions")
      .where("studentId", "==", "connection-check")
      .where("status", "==", "completed")
      .where("billable", "==", true)
      .where("billedStatementId", "==", null)
      .where("sessionDate", ">=", "1900-01-01")
      .where("sessionDate", "<=", "2100-12-31")
      .orderBy("sessionDate")
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();
    for (const filter of ["status", "studentId", "both"]) {
      step = `firestore-statements-${filter}-index`;
      let query: FirebaseFirestore.Query = probe.collection("statements");
      if (filter !== "studentId") query = query.where("status", "==", "draft");
      if (filter !== "status")
        query = query.where("studentId", "==", "connection-check");
      await query
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc")
        .limit(1)
        .get();
    }
    step = "firestore-summary-index";
    await probe
      .collection("sessions")
      .where("status", "==", "completed")
      .where("billable", "==", true)
      .where("billedStatementId", "==", null)
      .aggregate({
        count: AggregateField.count(),
        amountVnd: AggregateField.sum("amountVnd"),
      })
      .get();
    step = "firestore-payments-history-index";
    await probe
      .collection("payments")
      .where("statementId", "==", "connection-check")
      .orderBy("recordedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(1)
      .get();
    step = "firestore-public-payments-index";
    await probe
      .collection("payments")
      .where("statementId", "==", "connection-check")
      .where("voidedAt", "==", null)
      .orderBy("receivedDate")
      .orderBy(FieldPath.documentId())
      .limit(101)
      .get();
    step = "firestore-monthly-payments-index";
    await probe
      .collection("payments")
      .where("voidedAt", "==", null)
      .where("receivedDate", ">=", "1900-01-01")
      .where("receivedDate", "<=", "2100-12-31")
      .aggregate({ amountVnd: AggregateField.sum("amountVnd") })
      .get();
    step = "firestore-outstanding-index";
    await probe
      .collection("statements")
      .where("status", "==", "issued")
      .aggregate({
        totalVnd: AggregateField.sum("totalVnd"),
        paidVnd: AggregateField.sum("paidVnd"),
      })
      .get();
    step = "firestore-overdue-index";
    await probe
      .collection("statements")
      .where("status", "==", "issued")
      .where("dueDate", "<", "2100-12-31")
      .aggregate({
        totalVnd: AggregateField.sum("totalVnd"),
        paidVnd: AggregateField.sum("paidVnd"),
      })
      .get();
    step = "firestore-export-read-time";
    const exportSnapshot = await probe.get();
    await db.runTransaction(
      (tx) =>
        tx.get(
          probe.collection("students").orderBy(FieldPath.documentId()).limit(1),
        ),
      { readOnly: true, readTime: exportSnapshot.readTime },
    );
    step = "firestore-deletion-access";
    const { accountControlRef } =
      await import("../../src/lib/server/account-access");
    await accountControlRef(probeUid).get();
    await db
      .collection("apps/chotcong/shareTokens")
      .where("ownerUid", "==", probeUid)
      .limit(1)
      .get();
    step = "firestore-onboarding-access";
    await probe.collection("preferences").doc("onboarding").get();
    step = "firestore-classes-appearance-access";
    await probe.collection("preferences").doc("appearance").get();
    await probe
      .collection("classes")
      .orderBy("displayName")
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();
    await probe
      .collection("lessons")
      .orderBy("sessionDate", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(1)
      .get();
    await probe
      .collection("sessions")
      .where("status", "==", "completed")
      .limit(1)
      .get();
    await probe
      .collection("students")
      .where("archivedAt", "==", null)
      .limit(1)
      .get();
    await db.terminate();
    console.log(JSON.stringify({ event: "firebase.cloud.preflight.passed" }));
  } catch (error: unknown) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (typeof error.code === "number" ||
        (typeof error.code === "string" &&
          /^[a-zA-Z0-9_/-]+$/.test(error.code)))
        ? error.code
        : "cloud-check-failed";
    fail(code);
  } finally {
    clearTimeout(deadline);
  }
} else {
  console.log(
    "Firebase cloud preflight skipped: local/CI or cloud auth not selected.",
  );
}
