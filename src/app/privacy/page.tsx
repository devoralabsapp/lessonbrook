import { getI18n } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Dữ liệu & quyền riêng tư"),
    description: t(
      "Dữ liệu LessonBrook lưu, nội dung link chia sẻ và cách xuất hoặc xóa tài khoản.",
    ),
  };
}
export default async function PrivacyPage() {
  const { t } = await getI18n();
  return (
    <InfoLayout
      title={t("Dữ liệu trong sổ của bạn")}
      description={t(
        "Bản giải thích cho giai đoạn thử nghiệm LessonBrook · Cập nhật ngày 16/10/2026.",
      )}
    >
      <section className="space-y-3">
        <h2 className="serif text-2xl">{t("Dữ liệu nào được lưu?")}</h2>
        <p>
          {t(
            "LessonBrook dùng tài khoản Google để đăng nhập, lưu định danh tài khoản, tên và email để gắn đúng sổ của bạn. Bạn có thể sửa tên giáo viên và thêm thông tin nhận chuyển khoản.",
          )}
        </p>
        <p>
          {t(
            "Sổ lưu học viên, lớp và danh sách tham gia, đơn giá, buổi dạy, bảng kê, khoản thu, lựa chọn giao diện và lịch sử sửa ghi nhận. Tên người liên hệ, điện thoại và ghi chú là thông tin tùy chọn do bạn nhập. Chỉ nhập thông tin cần thiết cho việc dạy và đối chiếu học phí.",
          )}
        </p>
        <p>
          {t(
            "Dữ liệu được xử lý qua máy chủ LessonBrook trên Vercel, sử dụng Firebase Authentication và Cloud Firestore của Google để đăng nhập và lưu sổ. Người vận hành có quyền quản trị cần thiết để hỗ trợ và xử lý sự cố.",
          )}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="serif text-2xl">{t("Khi gửi link bảng kê")}</h2>
        <p>
          {t(
            "Bạn xem trước nội dung công khai rồi chủ động bật chia sẻ. Ai có link đều có thể xem và chuyển tiếp mà không cần tài khoản.",
          )}
        </p>
        <p>
          {t(
            "Link hiển thị tên giáo viên và người nhận đã chốt, mã bảng kê, ngày, các dòng học phí, tổng cần thu, các ngày/số tiền đã ghi nhận thu và số còn thiếu. Thông tin chuyển khoản chỉ có nếu bạn đã chọn đưa vào bảng kê.",
          )}
        </p>
        <p>
          {t(
            "Email, điện thoại, ghi chú nội bộ và dữ liệu của học viên khác không được đưa vào trang chia sẻ. Số tiền đã thu là theo ghi nhận của giáo viên, không phải xác nhận từ ngân hàng.",
          )}
        </p>
        <p>
          {t(
            "Link mặc định hết hạn sau 30 ngày. Bạn có thể thu hồi hoặc tạo link mới ngay trong bảng kê. Thu hồi chặn lần truy cập tiếp theo; người nhận vẫn có thể giữ ảnh hoặc nội dung đã xem.",
          )}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="serif text-2xl">
          {t("Phiên đăng nhập và hoạt động kỹ thuật")}
        </h2>
        <p>
          {t(
            "Cookie cần thiết giữ phiên đăng nhập tối đa 5 ngày và bảo vệ thao tác lưu. Bạn có thể đăng xuất hoặc đăng xuất mọi thiết bị trong Cài đặt. Trên thiết bị dùng chung, hãy đăng xuất sau khi dùng.",
          )}
        </p>
        <p>
          {t(
            "Ứng dụng giữ lịch sử thao tác trong sổ để đối chiếu và thông tin kỹ thuật tối thiểu để xử lý lỗi, chống truy cập tự động. Trang bảng kê chia sẻ không nạp công cụ phân tích bên thứ ba. LessonBrook không gửi tin nhắn Zalo, đọc giao dịch ngân hàng hoặc tự xác nhận chuyển khoản.",
          )}
        </p>
      </section>
      <p>
        {t(
          "Cookie ngôn ngữ ghi nhớ lựa chọn English / Tiếng Việt trên trình duyệt trong tối đa một năm. Cookie này không chứa thông tin học viên hoặc học phí.",
        )}
      </p>
      <section className="space-y-3">
        <h2 className="serif text-2xl">{t("Lấy dữ liệu của bạn")}</h2>
        <p>
          {t("Trong")}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/app/settings"
          >
            {t("Cài đặt tài khoản")}
          </Link>
          {t(
            ", chọn xuất từng nhóm CSV hoặc toàn bộ dữ liệu thành ZIP gồm CSV và JSON. Bản xuất có cả lịch sử lưu trữ, bảng kê hủy và khoản thu vô hiệu hóa.",
          )}
        </p>
        <p>
          {t(
            "File tải xuống thuộc trách nhiệm lưu giữ của bạn. Bản thử nghiệm hiện chưa có chức năng nhập lại file xuất; hãy giữ bản cần đối chiếu ở nơi riêng tư.",
          )}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="serif text-2xl">{t("Ngừng dùng và xóa tài khoản")}</h2>
        <p>
          {t(
            "Bạn có thể lấy dữ liệu trước, rồi yêu cầu xóa trong Cài đặt. App yêu cầu xác nhận và đăng nhập lại đúng tài khoản Google. Khi yêu cầu bắt đầu, mọi link của bạn ngừng truy cập và sổ được khóa để tiến hành xóa.",
          )}
        </p>
        <p>
          {t(
            "Quy trình xóa học viên, buổi dạy, bảng kê, khoản thu, thông tin nhận tiền, lịch sử trong sổ và tài khoản đăng nhập LessonBrook. Tài khoản Google của bạn không bị xóa. Sau khi xác nhận, không thể hủy yêu cầu.",
          )}
        </p>
        <p>
          {t(
            "Nếu bị gián đoạn, mở lại trang tiến trình xóa để tiếp tục. Hệ thống giữ dấu trạng thái kỹ thuật tối thiểu để tiếp tục yêu cầu và ngăn thao tác cũ tạo lại dữ liệu; dấu này không chứa tên, email hoặc học phí và hiện chưa đặt thời hạn xóa tự động.",
          )}
        </p>
        <p>
          {t(
            "Gỡ biểu tượng app hoặc đăng xuất không xóa sổ. Người đã nhận bảng kê có thể vẫn giữ bản sao họ tự lưu.",
          )}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="serif text-2xl">{t("Câu hỏi về dữ liệu")}</h2>
        <p>
          {t(
            "Trong giai đoạn thử nghiệm, liên hệ người đã mời bạn dùng app qua kênh hai bên đang trao đổi. Xem",
          )}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/help#support"
          >
            {t("cách yêu cầu hỗ trợ")}
          </Link>
          {t("; không gửi link bảng kê công khai vào nhóm hỗ trợ.")}
        </p>
      </section>
    </InfoLayout>
  );
}
