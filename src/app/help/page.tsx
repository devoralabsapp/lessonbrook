import { getI18n } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";
import { Card } from "@/components/ui/card";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Hướng dẫn & hỗ trợ"),
    description: t(
      "Cách ghi buổi, lập bảng kê, đối chiếu tiền và dùng LessonBrook trên điện thoại.",
    ),
  };
}
export default async function HelpPage() {
  const { t } = await getI18n();
  return (
    <InfoLayout
      title={t("Dùng sổ nhẹ nhàng mỗi ngày")}
      description={t(
        "Dành cho dạy cá nhân và lớp học, tính theo buổi và thu sau. Bạn tự nhận tiền mặt hoặc chuyển khoản, rồi ghi nhận vào sổ.",
      )}
    >
      <p className="rounded-xl bg-accent-soft p-4">
        {t(
          "Dùng bộ chọn English / Tiếng Việt để đổi ngôn ngữ. Tiếng Anh là mặc định; lựa chọn được nhớ trên trình duyệt này. Hãy lưu nội dung đang sửa trước khi đổi ngôn ngữ.",
        )}
      </p>
      <nav
        aria-label={t("Trong hướng dẫn")}
        className="grid gap-2 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
      >
        {[
          ["#start", t("Ghi buổi & lập bảng kê")],
          ["#classes", t("Lớp học & buổi nhóm")],
          ["#appearance", t("Chọn giao diện")],
          ["#payments", t("Nhận tiền & sửa ghi nhận")],
          ["#sharing", t("Gửi link & giữ riêng tư")],
          ["#connection", t("Khi mất mạng hoặc hết phiên")],
          ["#install", t("Thêm vào màn hình chính")],
          ["#support", t("Cần trợ giúp")],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg px-2 py-1 text-primary underline underline-offset-4"
          >
            {t(label)}
          </Link>
        ))}
      </nav>
      <section id="start" className="space-y-4">
        <h2 className="serif text-2xl">{t("Từ buổi dạy đến bảng kê")}</h2>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            {t(
              "Thêm học viên với tên và đơn giá mỗi buổi. Sổ bắt đầu từ các buổi bạn nhập, chưa bao gồm khoản nợ cũ.",
            )}
          </li>
          <li>
            {t(
              "Chọn “Ghi buổi dạy”, kiểm tra học viên, ngày, đơn giá và trạng thái “Đã dạy”. Có thể ghi bù. Đổi đơn giá học viên chỉ áp dụng cho buổi mới.",
            )}
          </li>
          <li>
            {t(
              "Vào “Bảng kê” → “Lập bảng kê”, chọn học viên và khoảng ngày. Chỉ buổi đã dạy có tính phí, chưa lập bảng kê mới được chọn.",
            )}
          </li>
          <li>
            {t(
              "Kiểm tra học viên, các buổi và ngày đến hạn rồi bấm Lập bảng kê để phát hành ngay. Bạn có thể sửa bảng kê trước khi ghi nhận khoản thu. Mỗi bảng kê có tối đa 100 buổi.",
            )}
          </li>
        </ol>
        <p>
          {t(
            "Buổi hủy và buổi miễn phí vẫn ở lịch sử học. Buổi đã vào bảng kê phát hành được khóa để giữ số liệu đối chiếu.",
          )}
        </p>
        <Link
          className="text-primary underline underline-offset-4"
          href="/onboarding"
        >
          {t("Mở hướng dẫn bắt đầu từng bước")}
        </Link>
      </section>
      <section id="classes" className="space-y-4">
        <h2 className="serif text-2xl">{t("Một buổi, nhiều học viên")}</h2>
        <p>
          {t(
            "Vào “Lớp học” để đặt tên lớp, chọn các học viên đã có và nhập học phí mỗi người mỗi buổi. Một học viên có thể tham gia nhiều lớp. Tối đa 50 người trong một lớp hoặc buổi nhóm.",
          )}
        </p>
        <p>
          {t(
            "Mở lớp → “Ghi buổi cho lớp”, bỏ chọn người vắng, kiểm tra ngày và đơn giá rồi lưu. Mỗi người được chọn có cùng một mức giá đã lưu của lớp; tổng buổi bằng đơn giá nhân số người tham gia có tính phí. Đổi thành viên hoặc giá lớp không sửa buổi cũ.",
          )}
        </p>
        <p>
          {t(
            "Trong “Ghi buổi dạy”, mục “Dạy cho” cho phép chọn một học viên, nhóm tự chọn hoặc một lớp. Nhóm tự chọn dùng một đơn giá/người do bạn nhập. Danh sách buổi theo học viên có một dòng cho mỗi người; “Buổi nhóm & lớp” gom về một thẻ cho mỗi buổi chung.",
          )}
        </p>
        <p>
          {t(
            "Bảng kê và khoản thu vẫn riêng từng học viên. Danh sách lớp và các học viên khác không xuất hiện trong link công khai. Sau khi lưu, danh sách tham gia buổi được giữ cố định; có thể hủy hoặc miễn phí riêng một học viên chưa lập bảng kê. Thông tin ngày/giờ/giá chung được sửa ở trang buổi nhóm và khóa khi có bất kỳ người nào đã lên bảng kê.",
          )}
        </p>
      </section>
      <section id="appearance" className="space-y-4">
        <h2 className="serif text-2xl">{t("Cuốn sổ theo màu bạn thích")}</h2>
        <p>
          {t(
            "Bấm nút bảng màu trên thanh đầu trang và chọn theme để xem thử ngay. Bấm “Lưu giao diện” để áp dụng cho tài khoản trên các thiết bị. Đóng bảng chọn, chuyển trang hoặc tải lại sẽ bỏ lựa chọn chưa lưu.",
          )}
        </p>
      </section>
      <section id="payments" className="space-y-4">
        <h2 className="serif text-2xl">{t("Nhận tiền và sửa ghi nhận")}</h2>
        <p>
          {t(
            "Mở bảng kê → “Ghi nhận thu tiền”, nhập số tiền thực nhận, ngày nhận và hình thức. Có thể ghi nhiều lần, mỗi lần tối đa số còn thiếu. Một khoản trả cho nhiều bảng kê cần nhập riêng vào từng bảng.",
          )}
        </p>
        <Card className="space-y-2 bg-[#eef3e6] p-5">
          <p>
            <strong>{t("Ví dụ:")}</strong>
            {t(
              " 8 buổi × 200.000đ = 1.600.000đ. Ghi nhận đã nhận 1.000.000đ thì còn 600.000đ; ghi thêm 600.000đ là đã thu đủ.",
            )}
          </p>
          <p>
            {t(
              "“Đã thu trong tháng” tính theo ngày nhận tiền tại Việt Nam. Các buổi chưa lập bảng kê chưa được cộng vào “Còn phải thu”. Ngay ngày đến hạn chưa được tính là quá hạn.",
            )}
          </p>
        </Card>
        <details className="rounded-2xl border border-border bg-card p-5">
          <summary className="cursor-pointer font-semibold text-primary">
            {t("Nếu nhập sai khoản thu hoặc cần sửa bảng kê?")}
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              {t(
                "Vô hiệu hóa khoản thu sai kèm lý do, rồi ghi khoản đúng. Lịch sử được giữ lại; thao tác này chỉ sửa sổ ghi nhận, không hoàn tiền thực tế.",
              )}
            </p>
            <p>
              {t(
                "Chỉ hủy bảng kê khi không còn khoản thu hợp lệ. Nếu cần lập lại bản đã nhận tiền: đối chiếu trước, vô hiệu hóa ghi nhận, hủy bản cũ, lập bản mới rồi ghi lại khoản tiền thực nhận. Các buổi được giải phóng khi hủy.",
              )}
            </p>
          </div>
        </details>
        <p>
          {t(
            "LessonBrook ghi tiền theo xác nhận của giáo viên; bạn cần tự đối chiếu tiền mặt hoặc tài khoản ngân hàng. Bảng kê dùng để đối chiếu học phí.",
          )}
        </p>
      </section>
      <section id="sharing" className="space-y-4">
        <h2 className="serif text-2xl">{t("Gửi bảng kê qua link")}</h2>
        <p>
          {t(
            "Sau khi phát hành, xem trước đúng nội dung công khai rồi bật link. Sao chép tin nhắn để tự gửi qua Zalo hoặc kênh bạn chọn. Người nhận không cần đăng nhập.",
          )}
        </p>
        <p>
          {t(
            "Ai có link đều có thể xem và chuyển tiếp. Link mặc định hết hạn sau 30 ngày; bạn có thể thu hồi ngay. Khi cần lấy lại link sau khi đóng màn hình, tạo link mới; link cũ sẽ ngừng dùng.",
          )}
        </p>
        <p>
          {t(
            "Người nhận xem được tên đã chốt, ngày và học phí từng buổi, các khoản đã thu, số còn thiếu và thông tin chuyển khoản trên bảng kê. Ghi chú riêng, email và điện thoại được giữ trong sổ của giáo viên.",
          )}
        </p>
        <p>
          {t(
            "Người nhận báo không mở được? Kiểm tra link còn hạn, chưa thu hồi và bảng kê chưa hủy; tạo link mới rồi gửi lại toàn bộ link. Nếu đang mở trong Zalo, thử mở bằng Safari hoặc Chrome. Lượt mở không xác nhận người nhận đã đọc.",
          )}
        </p>
        <Link
          className="text-primary underline underline-offset-4"
          href="/privacy"
        >
          {t("Xem dữ liệu được lưu và cách xuất/xóa")}
        </Link>
      </section>
      <section id="connection" className="space-y-4">
        <h2 className="serif text-2xl">{t("Khi mất mạng hoặc hết phiên")}</h2>
        <p>
          {t(
            "Cần mạng để đọc và lưu sổ. Nếu báo chưa lưu, giữ nguyên biểu mẫu, kết nối lại rồi nhấn lưu để thử lại. Chờ thông báo thành công trước khi rời trang; tải lại hoặc đóng trang có thể làm mất nội dung chưa lưu.",
          )}
        </p>
        <p>
          {t(
            "Nếu phải đăng nhập lại, dùng đúng tài khoản Google đã mở sổ. Không thấy dữ liệu? Kiểm tra tài khoản, trạng thái học viên đang học/lưu trữ, khoảng ngày và bộ lọc trước khi nhập lại.",
          )}
        </p>
        <p>
          {t(
            "Trên thiết bị dùng chung, vào Cài đặt để đăng xuất. “Đăng xuất mọi thiết bị” thu hồi các phiên hiện tại; lần mở sổ tiếp theo cần đăng nhập lại.",
          )}
        </p>
      </section>
      <section id="install" className="space-y-4">
        <h2 className="serif text-2xl">
          {t("Thêm LessonBrook vào màn hình chính")}
        </h2>
        <p>
          {t("Mở trang tổng quan")}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/app"
          >
            {t("sổ của bạn")}
          </Link>{" "}
          {t(
            "bằng trình duyệt trên điện thoại, rồi làm theo hướng dẫn dưới. Nếu đang xem bảng kê chia sẻ, quay về sổ trước khi thêm biểu tượng.",
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">iPhone · Safari</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t("Mở menu trang hoặc nút Chia sẻ của Safari.")}</li>
              <li>{t("Chọn “Thêm vào Màn hình chính”.")}</li>
              <li>
                {t("Bật “Mở dưới dạng ứng dụng web” nếu có, rồi chọn “Thêm”.")}
              </li>
            </ol>
            <a
              className="inline-block text-xs text-primary underline underline-offset-4"
              href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
              rel="noreferrer"
            >
              {t("Hướng dẫn của Apple")}
            </a>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">Android · Chrome</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t("Mở menu ba chấm của Chrome.")}</li>
              <li>
                {t(
                  "Chọn “Cài đặt và tạo lối tắt” → “Cài đặt”, hoặc “Thêm vào màn hình chính” tùy phiên bản.",
                )}
              </li>
              <li>{t("Làm theo hướng dẫn trên điện thoại.")}</li>
            </ol>
            <a
              className="inline-block text-xs text-primary underline underline-offset-4"
              href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=vi"
              rel="noreferrer"
            >
              {t("Hướng dẫn của Google")}
            </a>
          </Card>
        </div>
        <p>
          {t(
            "Biểu tượng giúp mở sổ nhanh. Bạn vẫn cần kết nối mạng và có thể cần đăng nhập lại. Gỡ biểu tượng khỏi điện thoại không xóa tài khoản hoặc dữ liệu trong sổ.",
          )}
        </p>
      </section>
      <section
        id="support"
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
      >
        <h2 className="serif text-2xl">{t("Cần trợ giúp?")}</h2>
        <p>
          {t(
            "Trong giai đoạn thử nghiệm, liên hệ trực tiếp người đã mời bạn dùng LessonBrook qua kênh hai bên đang trao đổi.",
          )}
        </p>
        <p>
          {t(
            "Cho biết màn hình đang dùng, thao tác vừa làm, giờ gặp lỗi và thông báo lỗi. Nếu gửi ảnh, che tên học viên, thông tin liên hệ và thông tin ngân hàng. Giữ link bảng kê riêng; người hỗ trợ có thể hướng dẫn bạn đối chiếu bằng dữ liệu mẫu.",
          )}
        </p>
        <p>
          {t("Muốn giữ dữ liệu hoặc ngừng dùng? Vào")}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/app/settings"
          >
            {t("Cài đặt tài khoản")}
          </Link>{" "}
          {t("để xuất dữ liệu, đăng xuất hoặc yêu cầu xóa.")}
        </p>
      </section>
    </InfoLayout>
  );
}
