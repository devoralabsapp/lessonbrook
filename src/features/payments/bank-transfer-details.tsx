import { useDemoWorkspace } from "@/components/workspace-link";
import { encode } from "uqr";
import { type BankTransfer, vietQrPayload } from "@/domain/bank-transfer";
import { formatVnd } from "@/domain";
import { useI18n } from "@/lib/i18n/client";

export function BankTransferDetails({
  bank,
  legacyDetails,
  reference,
  remainingVnd,
  className,
}: {
  bank?: BankTransfer | null;
  legacyDetails: string | null;
  reference?: string | null;
  remainingVnd: number;
  className: string;
}) {
  const { t, locale } = useI18n();
  const demo = useDemoWorkspace();
  const payable = remainingVnd > 0 && reference;
  if (!bank && !legacyDetails && !payable) return null;

  const qr =
    bank && payable
      ? encode(
          demo
            ? `LessonBrook demo ${payable}`
            : vietQrPayload(bank, remainingVnd, payable),
          {
            ecc: "M",
            border: 4,
          },
        )
      : null;
  const path = qr?.data
    .map((row, y) =>
      row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")).join(""),
    )
    .join("");

  return (
    <section className={className}>
      <h3 className="mb-2 text-sm font-semibold">{t("Thông tin nhận tiền")}</h3>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-52 break-words text-sm leading-6">
          {bank ? (
            <dl>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("Tên ngân hàng")}{" "}
                </dt>
                <dd className="inline font-semibold">{bank.bankName}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("Số tài khoản")}{" "}
                </dt>
                <dd className="inline font-semibold">{bank.accountNumber}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("Tên người nhận")}{" "}
                </dt>
                <dd className="inline font-semibold">{bank.accountName}</dd>
              </div>
            </dl>
          ) : (
            legacyDetails && (
              <p className="whitespace-pre-wrap">{legacyDetails}</p>
            )
          )}
          {payable && (
            <p className="mt-2">
              {t("Nội dung chuyển khoản:")}{" "}
              <strong className="select-all">{reference}</strong>
            </p>
          )}
          {qr && (
            <p className="mt-2 text-muted-foreground">
              {demo
                ? t("Đây là mã QR mẫu.")
                : t("Quét VietQR để chuyển {0}.", {
                    "0": formatVnd(remainingVnd, locale),
                  })}
            </p>
          )}
        </div>
        {qr && (
          <svg
            role="img"
            aria-label={t(demo ? "Mã QR mẫu" : "Mã VietQR chuyển khoản")}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            className="h-auto w-44 max-w-full rounded-lg border border-border bg-white"
            shapeRendering="crispEdges"
          >
            <path d={path} fill="#000" />
          </svg>
        )}
      </div>
    </section>
  );
}
