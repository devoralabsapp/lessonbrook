import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Hướng dẫn & hỗ trợ",
  description:
    "Cách ghi buổi, lập bảng kê, đối chiếu tiền và dùng LessonBrook trên điện thoại.",
};

export default function HelpPage() {
  return (
    <InfoLayout
      title="Dùng sổ nhẹ nhàng mỗi ngày"
      description="Dành cho dạy cá nhân và lớp học, tính theo buổi và thu sau. Bạn tự nhận tiền mặt hoặc chuyển khoản, rồi ghi nhận vào sổ."
    >
      <nav
        aria-label="Trong hướng dẫn"
        className="grid gap-2 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
      >
        {[
          ["#start", "Ghi buổi & lập bảng kê"],
          ["#classes", "Lớp học & buổi nhóm"],
          ["#appearance", "Chọn giao diện"],
          ["#payments", "Nhận tiền & sửa ghi nhận"],
          ["#sharing", "Gửi link & giữ riêng tư"],
          ["#connection", "Khi mất mạng hoặc hết phiên"],
          ["#install", "Thêm vào màn hình chính"],
          ["#support", "Cần trợ giúp"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg px-2 py-1 text-primary underline underline-offset-4"
          >
            {label}
          </Link>
        ))}
      </nav>
      <section id="start" className="space-y-4">
        <h2 className="serif text-2xl">Từ buổi dạy đến bảng kê</h2>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Thêm học viên với tên và đơn giá mỗi buổi. Sổ bắt đầu từ các buổi
            bạn nhập, chưa bao gồm khoản nợ cũ.
          </li>
          <li>
            Chọn “Ghi buổi dạy”, kiểm tra học viên, ngày, đơn giá và trạng thái
            “Đã dạy”. Có thể ghi bù. Đổi đơn giá học viên chỉ áp dụng cho buổi
            mới.
          </li>
          <li>
            Vào “Bảng kê” → “Lập bảng kê”, chọn học viên và khoảng ngày. Chỉ
            buổi đã dạy có tính phí, chưa lập bảng kê mới được chọn.
          </li>
          <li>
            Lưu nháp, xem trước tên người nhận, các buổi, thông tin chuyển khoản
            và ngày đến hạn; kiểm tra rồi phát hành. Tối đa 100 buổi mỗi bảng
            kê.
          </li>
        </ol>
        <p>
          Buổi hủy và buổi miễn phí vẫn ở lịch sử học. Buổi đã vào bảng kê phát
          hành được khóa để giữ số liệu đối chiếu.
        </p>
        <Link
          className="text-primary underline underline-offset-4"
          href="/onboarding"
        >
          Mở hướng dẫn bắt đầu từng bước
        </Link>
      </section>
      <section id="classes" className="space-y-4">
        <h2 className="serif text-2xl">Một buổi, nhiều học viên</h2>
        <p>
          Vào “Lớp học” để đặt tên lớp, chọn các học viên đã có và nhập học phí
          mỗi người mỗi buổi. Một học viên có thể tham gia nhiều lớp. Tối đa 50
          người trong một lớp hoặc buổi nhóm.
        </p>
        <p>
          Mở lớp → “Ghi buổi cho lớp”, bỏ chọn người vắng, kiểm tra ngày và đơn
          giá rồi lưu. Mỗi người được chọn có cùng một mức giá đã lưu của lớp;
          tổng buổi bằng đơn giá nhân số người tham gia có tính phí. Đổi thành
          viên hoặc giá lớp không sửa buổi cũ.
        </p>
        <p>
          Trong “Ghi buổi dạy”, mục “Dạy cho” cho phép chọn một học viên, nhóm
          tự chọn hoặc một lớp. Nhóm tự chọn dùng một đơn giá/người do bạn nhập.
          Danh sách buổi theo học viên có một dòng cho mỗi người; “Buổi nhóm
          &amp; lớp” gom về một thẻ cho mỗi buổi chung.
        </p>
        <p>
          Bảng kê và khoản thu vẫn riêng từng học viên. Danh sách lớp và các học
          viên khác không xuất hiện trong link công khai. Sau khi lưu, danh sách
          tham gia buổi được giữ cố định; có thể hủy hoặc miễn phí riêng một học
          viên chưa lập bảng kê. Thông tin ngày/giờ/giá chung được sửa ở trang
          buổi nhóm và khóa khi có bất kỳ người nào đã lên bảng kê.
        </p>
      </section>
      <section id="appearance" className="space-y-4">
        <h2 className="serif text-2xl">Cuốn sổ theo màu bạn thích</h2>
        <p>
          Vào “Cài đặt tài khoản” → “Giao diện của bạn”, chọn Modern, Vintage,
          Art, Natura, Ocean, Command Line hoặc Visual Code để xem thử ngay.
          Command Line dùng nền đen với điểm nhấn xanh. Bấm “Lưu giao diện” để
          lưu theo tài khoản và dùng trên các thiết bị. Nếu chưa lưu, bấm “Hủy
          xem trước”, rời cài đặt hoặc tải lại trang để trở về lựa chọn đã lưu.
          Trang bảng kê gửi cho người nhận giữ cách trình bày riêng.
        </p>
      </section>
      <section id="payments" className="space-y-4">
        <h2 className="serif text-2xl">Nhận tiền và sửa ghi nhận</h2>
        <p>
          Mở bảng kê → “Ghi nhận thu tiền”, nhập số tiền thực nhận, ngày nhận và
          hình thức. Có thể ghi nhiều lần, mỗi lần tối đa số còn thiếu. Một
          khoản trả cho nhiều bảng kê cần nhập riêng vào từng bảng.
        </p>
        <Card className="space-y-2 bg-[#eef3e6] p-5">
          <p>
            <strong>Ví dụ:</strong> 8 buổi × 200.000đ = 1.600.000đ. Ghi nhận đã
            nhận 1.000.000đ thì còn 600.000đ; ghi thêm 600.000đ là đã thu đủ.
          </p>
          <p>
            “Đã thu trong tháng” tính theo ngày nhận tiền tại Việt Nam. Các buổi
            chưa lập bảng kê chưa được cộng vào “Còn phải thu”. Ngay ngày đến
            hạn chưa được tính là quá hạn.
          </p>
        </Card>
        <details className="rounded-2xl border border-border bg-card p-5">
          <summary className="cursor-pointer font-semibold text-primary">
            Nếu nhập sai khoản thu hoặc cần sửa bảng kê?
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              Vô hiệu hóa khoản thu sai kèm lý do, rồi ghi khoản đúng. Lịch sử
              được giữ lại; thao tác này chỉ sửa sổ ghi nhận, không hoàn tiền
              thực tế.
            </p>
            <p>
              Chỉ hủy bảng kê khi không còn khoản thu hợp lệ. Nếu cần lập lại
              bản đã nhận tiền: đối chiếu trước, vô hiệu hóa ghi nhận, hủy bản
              cũ, lập bản mới rồi ghi lại khoản tiền thực nhận. Các buổi được
              giải phóng khi hủy.
            </p>
          </div>
        </details>
        <p>
          LessonBrook ghi tiền theo xác nhận của giáo viên; bạn cần tự đối chiếu
          tiền mặt hoặc tài khoản ngân hàng. Bảng kê dùng để đối chiếu học phí.
        </p>
      </section>
      <section id="sharing" className="space-y-4">
        <h2 className="serif text-2xl">Gửi bảng kê qua link</h2>
        <p>
          Sau khi phát hành, xem trước đúng nội dung công khai rồi bật link. Sao
          chép tin nhắn để tự gửi qua Zalo hoặc kênh bạn chọn. Người nhận không
          cần đăng nhập.
        </p>
        <p>
          Ai có link đều có thể xem và chuyển tiếp. Link mặc định hết hạn sau 30
          ngày; bạn có thể thu hồi ngay. Khi cần lấy lại link sau khi đóng màn
          hình, tạo link mới; link cũ sẽ ngừng dùng.
        </p>
        <p>
          Người nhận xem được tên đã chốt trên bảng kê, ngày và tiền từng buổi,
          tổng đã ghi nhận thu, số còn thiếu và thông tin nhận tiền bạn đã chọn
          chia sẻ. Ghi chú riêng, email và điện thoại không nằm trong bảng kê
          công khai.
        </p>
        <p>
          Người nhận báo không mở được? Kiểm tra link còn hạn, chưa thu hồi và
          bảng kê chưa hủy; tạo link mới rồi gửi lại toàn bộ link. Nếu đang mở
          trong Zalo, thử mở bằng Safari hoặc Chrome. Lượt mở không xác nhận
          người nhận đã đọc.
        </p>
        <Link
          className="text-primary underline underline-offset-4"
          href="/privacy"
        >
          Xem dữ liệu được lưu và cách xuất/xóa
        </Link>
      </section>
      <section id="connection" className="space-y-4">
        <h2 className="serif text-2xl">Khi mất mạng hoặc hết phiên</h2>
        <p>
          Cần mạng để đọc và lưu sổ. Nếu báo chưa lưu, giữ nguyên biểu mẫu, kết
          nối lại rồi nhấn lưu để thử lại. Chờ thông báo thành công trước khi
          rời trang; tải lại hoặc đóng trang có thể làm mất nội dung chưa lưu.
        </p>
        <p>
          Nếu phải đăng nhập lại, dùng đúng tài khoản Google đã mở sổ. Không
          thấy dữ liệu? Kiểm tra tài khoản, trạng thái học viên đang học/lưu
          trữ, khoảng ngày và bộ lọc trước khi nhập lại.
        </p>
        <p>
          Trên thiết bị dùng chung, vào Cài đặt để đăng xuất. “Đăng xuất mọi
          thiết bị” thu hồi các phiên hiện tại; lần mở sổ tiếp theo cần đăng
          nhập lại.
        </p>
      </section>
      <section id="install" className="space-y-4">
        <h2 className="serif text-2xl">Thêm LessonBrook vào màn hình chính</h2>
        <p>
          Mở trang tổng quan{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/app"
          >
            sổ của bạn
          </Link>{" "}
          bằng trình duyệt trên điện thoại, rồi làm theo hướng dẫn dưới. Nếu
          đang xem bảng kê chia sẻ, quay về sổ trước khi thêm biểu tượng.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">iPhone · Safari</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Mở menu trang hoặc nút Chia sẻ của Safari.</li>
              <li>Chọn “Thêm vào Màn hình chính”.</li>
              <li>Bật “Mở dưới dạng ứng dụng web” nếu có, rồi chọn “Thêm”.</li>
            </ol>
            <a
              className="inline-block text-xs text-primary underline underline-offset-4"
              href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
              rel="noreferrer"
            >
              Hướng dẫn của Apple
            </a>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">Android · Chrome</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Mở menu ba chấm của Chrome.</li>
              <li>
                Chọn “Cài đặt và tạo lối tắt” → “Cài đặt”, hoặc “Thêm vào màn
                hình chính” tùy phiên bản.
              </li>
              <li>Làm theo hướng dẫn trên điện thoại.</li>
            </ol>
            <a
              className="inline-block text-xs text-primary underline underline-offset-4"
              href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=vi"
              rel="noreferrer"
            >
              Hướng dẫn của Google
            </a>
          </Card>
        </div>
        <p>
          Biểu tượng giúp mở sổ nhanh. Bạn vẫn cần kết nối mạng và có thể cần
          đăng nhập lại. Gỡ biểu tượng khỏi điện thoại không xóa tài khoản hoặc
          dữ liệu trong sổ.
        </p>
      </section>
      <section
        id="support"
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
      >
        <h2 className="serif text-2xl">Cần trợ giúp?</h2>
        <p>
          Trong giai đoạn thử nghiệm, liên hệ trực tiếp người đã mời bạn dùng
          LessonBrook qua kênh hai bên đang trao đổi.
        </p>
        <p>
          Cho biết màn hình đang dùng, thao tác vừa làm, giờ gặp lỗi và thông
          báo lỗi. Nếu gửi ảnh, che tên học viên, thông tin liên hệ và thông tin
          ngân hàng. Giữ link bảng kê riêng; người hỗ trợ có thể hướng dẫn bạn
          đối chiếu bằng dữ liệu mẫu.
        </p>
        <p>
          Muốn giữ dữ liệu hoặc ngừng dùng? Vào{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/app/settings"
          >
            Cài đặt tài khoản
          </Link>{" "}
          để xuất dữ liệu, đăng xuất hoặc yêu cầu xóa.
        </p>
      </section>
    </InfoLayout>
  );
}
