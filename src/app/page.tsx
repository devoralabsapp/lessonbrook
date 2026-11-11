import { formatVnd } from "@/domain";
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { ArrowRight, Leaf, NotebookPen, Play } from "lucide-react";
import { redirect } from "next/navigation";
import { HomeAppearance } from "@/components/home-appearance";
import { HomeLedgerMotion } from "@/components/home-ledger-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoLinks } from "@/components/info-links";
import { getGuestTheme } from "@/lib/server/guest-theme";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { AppError } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";
export default async function Home() {
  if (hasFirebaseServerConfig()) {
    const signedIn = await requireUser({ allowDeleting: true }).catch(
      (error: unknown) => {
        if (error instanceof AppError && error.status === 401) return null;
        throw error;
      },
    );
    if (signedIn) redirect("/app");
  }
  const [{ t, locale }, theme] = await Promise.all([
    getI18n(),
    getGuestTheme(),
  ]);
  return (
    <HomeAppearance initialTheme={theme}>
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-accent-soft px-3 py-1.5 text-xs font-medium">
            <Leaf size={14} />
            {t(" Dành cho giáo viên tự do")}
          </div>
          <h1 className="serif text-5xl leading-[1.15] tracking-tight md:text-6xl">
            {t("Dạy hết mình.")}
            <br />
            <span className="text-primary">{t("Nhẹ đầu sổ sách.")}</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
            {t(
              "Một nơi gọn gàng để ghi buổi dạy và giữ đúng học phí từng học viên. Bắt đầu từ buổi dạy hôm nay.",
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="h-12">
              <Link href="/login">
                {t("Bắt đầu ghi buổi dạy ")}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link href="/demo">
                <Play aria-hidden="true" />
                {t("Xem demo")}
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("Dạy cá nhân & lớp học · Theo buổi · Thu học phí sau")}
          </p>
        </div>
        <HomeLedgerMotion>
          <Card className="p-6">
            <div className="mb-7 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <NotebookPen size={18} />
                {t(" Sổ buổi dạy")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("VÍ DỤ MINH HỌA")}
              </span>
            </div>
            <p className="serif text-2xl">
              {t("Mỗi buổi dạy,")}
              <br />
              {t("đều được ghi nhớ.")}
            </p>
            <div className="mt-6 space-y-3">
              {[
                `Lan · Piano · ${formatVnd(200000, locale)}`,
                `Minh · ${t("Tiếng Anh")} · ${formatVnd(250000, locale)}`,
              ].map((s, i) => (
                <div
                  key={s}
                  className="ledger-motion-step flex items-center gap-3 rounded-xl bg-surface p-4"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path
                        className="ledger-motion-check"
                        pathLength="1"
                        d="m5 12 4 4L19 6"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i
                        ? t("Buổi đã hoàn thành")
                        : t("Đơn giá được lưu theo buổi")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              {t("Đổi đơn giá mới, các buổi đã ghi vẫn giữ nguyên.")}
            </p>
          </Card>
          <span className="absolute -bottom-4 right-8 rounded-xl bg-warning-soft px-5 py-3 text-sm text-warning-foreground shadow-sm">
            {t("Bớt đối chiếu. Thêm thảnh thơi.")}
          </span>
        </HomeLedgerMotion>
      </section>
      <footer className="mx-auto max-w-6xl px-6 py-12 text-xs leading-5 text-muted-foreground">
        {t(
          "LessonBrook · Sổ buổi dạy & học phí cho giáo viên piano, ngoại ngữ và gia sư.",
        )}
        <br />
        {t("Sổ bắt đầu từ các buổi bạn nhập; chưa bao gồm khoản nợ cũ.")}
        <div className="mt-5">
          <InfoLinks />
        </div>
      </footer>
    </HomeAppearance>
  );
}
