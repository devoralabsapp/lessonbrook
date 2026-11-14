# Kiến trúc và quy tắc nghiệp vụ

[English](ARCHITECTURE.md) | **Tiếng Việt**

LessonBrook dùng Next.js App Router, React, TypeScript, Tailwind 4, Firebase Authentication và Cloud Firestore. Dự án chạy trên Node 24, dùng Webpack và cố định phiên bản thư viện trong lockfile. Xem [AGENTS.md](../AGENTS.md) để biết quy tắc làm việc và [HANDOFF.md](../HANDOFF.md) để biết mốc bàn giao gần nhất.

| Thư mục             | Nội dung                                                |
| ------------------- | ------------------------------------------------------- |
| `src/app`           | Trang và API Node                                       |
| `src/domain`        | Schema, tiền, ngày, bảng kê và dữ liệu xuất             |
| `src/lib/firebase`  | Auth client, Admin server và OIDC/WIF                   |
| `src/lib/server`    | Repository, session, giao thức HTTP, transaction        |
| `src/features`      | Giao diện học viên/lớp/buổi/bảng kê/thu tiền/chia sẻ    |
| `firebase`          | Rules, indexes và kiểm thử Rules độc lập                |
| `tests/integration` | HTTP/backend hai UID, transaction và các ca dữ liệu     |
| `tests/e2e`         | Chromium, popup thật của Auth Emulator, retry và reload |

## Ranh giới dữ liệu

Mọi thao tác nghiệp vụ qua API server. UID chỉ lấy từ session Firebase đã kiểm tra thu hồi; không nhận ownerId/path do browser cung cấp. Dữ liệu riêng trong `apps/chotcong/users/{uid}`. Admin SDK bỏ qua Rules, nên kiểm tra backend hai UID khác với kiểm tra Rules deny client.

Cookie phiên HttpOnly/Lax, Secure trên HTTPS, tối đa 5 ngày. Browser Auth dùng bộ nhớ, ID token recent-auth đổi lấy cookie rồi sign out client. Mutation kiểm tra Origin/CSRF, strict payload/body limit, khóa idempotency UUID. Không cache xác minh phiên giữa các request; không lưu token/học phí vào browser storage hoặc log.

## Bất biến

- Tiền nguyên VND và safe integer; ngày nghiệp vụ YYYY-MM-DD theo Việt Nam; Timestamp hệ thống do server tạo, có schemaVersion.
- Đổi đơn giá học viên/lớp không đổi buổi đã lưu. Lớp tối đa 50 người, chỉ tính người được chọn; mỗi người có dòng học phí và bảng kê riêng.
- Transaction đọc hết trước ghi. Tạo result ID ngoài callback; callback có thể retry. Payload giống và cùng request ID trả cùng kết quả; cùng ID nhưng payload khác bị từ chối.
- Bảng kê tối đa 100 buổi đủ điều kiện. Phát hành chốt snapshot/counter và khóa billedStatementId cùng transaction. Nháp không là khoản phải thu; hủy chỉ khi không có khoản thu hợp lệ.
- Thu tiền không vượt số thiếu; vô hiệu hóa giữ lịch sử, đối chiếu paidVnd/count với payments.
- Link dùng mã ngẫu nhiên ở fragment `/s#token`; browser gửi POST body, server chỉ giữ hash. Có preview/expiry/rotation/revoke và allowlist nội dung công khai. Không log mã, cookie hoặc headers.
- Export phân trang cùng server readTime; ZIP/CSV không phải backup Firestore. Xóa tài khoản là state machine có lease/checkpoint và khóa ghi/link; không xóa tài khoản thật để chạy thử.

## Danh sách, lịch và thanh toán

- Demo dùng chung các màn hình với workspace. `/api/demo` xử lý dữ liệu giả trong bộ nhớ và thay đổi trong tab sẽ mất khi tải lại. iOS và Android dùng API chung, với Dashboard và thanh điều hướng native. Các tab sổ dạy còn lại dùng WebView.
- Students, Classes, Lessons và Statements mặc định mở dạng Notes. Classes và Lessons còn có lịch tháng. Hai tab Lessons và Statements mặc định lọc theo tháng hiện tại ở Việt Nam. Liên kết từ Dashboard theo trạng thái thu tiền và sổ riêng của học viên mặc định xem toàn bộ lịch sử.
- Khi workspace đang mở, hệ thống kiểm tra lịch lớp hằng tuần và tạo các buổi dự kiến đã đến giờ. Buổi học chỉ đủ điều kiện tính học phí khi đã hoàn thành và có tính phí.
- Bảng kê đã phát hành lưu thông tin tài khoản nhận tiền và hiển thị VietQR cho số còn thiếu. iPhone Shortcut có thể chuyển thông báo nhận tiền đến API. Hệ thống ghi khoản thu khi tài khoản, mã chuyển khoản và số tiền khớp. Giáo viên cũng có thể ghi thu tiền mặt và gửi link bảng kê qua Gmail nếu tài khoản được cấp quyền.

## Giới hạn

Gói trả trước và phân quyền nhiều nhân viên chưa nằm trong phạm vi hiện tại. Manifest cung cấp lối mở nhanh. Kiểm thử OAuth thật, IAM, index cloud và cài app trên thiết bị thật cần được thực hiện riêng. Xem [tài liệu tiếng Anh](ARCHITECTURE.md) để biết luồng xử lý và các tệp triển khai chi tiết.

## Tên sản phẩm và tính tương thích

LessonBrook là tên sản phẩm và repository. Các đường dẫn dữ liệu, tên cookie, mã demo project và guard loopback có `chotcong` tiếp tục là định danh nội bộ để giữ tương thích. Đổi tên hiển thị không di chuyển hoặc xóa dữ liệu; không đổi các định danh này chỉ để đặt tên lại bản fork.
