"use client";

import {
  sessionPaymentStatus,
  type SessionWithPayment,
} from "@/domain/list-filters";
import { paymentStatusLabels } from "@/domain/statements";
import { useI18n } from "@/lib/i18n/client";

export function LessonPaymentStatus({
  session,
}: {
  session: SessionWithPayment;
}) {
  const { t } = useI18n();
  const status = sessionPaymentStatus(session);
  if (!status)
    return session.status === "planned" && session.billable ? null : (
      <span className="text-xs text-muted-foreground">
        {t("Không tính phí")}
      </span>
    );
  return (
    <span className={`status status-${status}`}>
      {t(paymentStatusLabels[status])}
    </span>
  );
}
