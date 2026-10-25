# Kiểm tra bản phát hành public

[English](VERIFICATION.md) | **Tiếng Việt**

Ngày xác minh: **24/10/2026**. Môi trường: macOS x64, Node 24.22.1, npm 11.19.1, Java 21.0.11, Chromium Playwright 1.64.1. Dependencies giữ nguyên phiên bản trong lockfile.

| Kiểm tra | Kết quả |
|---|---|
| npm ci | Qua trên bản export độc lập |
| npm run lint | Qua |
| npm run typecheck | Qua |
| npm test | 60/60 qua |
| npm run build | Qua, Webpack; không có cloud credential/config |
| npm run test:emulator | 53 backend/Rules + 12 E2E qua; tổng **125/125** |
| npm audit --omit=dev | 0 advisory tại thời điểm kiểm tra |
| Template WIF | Shell syntax và print-config qua; thiếu xác nhận target thì dừng trước thao tác cloud |
| Gitleaks 8.30.1 | Không phát hiện secret trong nội dung staged và lịch sử public mới |

Các test chỉ dùng demo project và loopback, không có business write trên cloud. Runner đã tự dọn server/Emulator sau test. Có cảnh báo metadata lookup từ Google SDK trong một số worker; không làm fail test. Kết quả Emulator không chứng minh Google OAuth thật, HTTPS cookies, IAM, index cloud hoặc cài trên thiết bị thật; cần kiểm tra riêng khi tự triển khai.

CI của commit mã nguồn public đầu tiên đã [qua trên GitHub](https://github.com/devoralabsapp/lessonbrook/actions/runs/40001554602). Các lần cập nhật tài liệu sau đó không thay mã ứng dụng; không diễn giải chúng thành các lượt kiểm thử runtime mới.

## Phạm vi làm sạch

Bản public bắt đầu bằng lịch sử Git mới với tác giả trung tính; không xuất lịch sử private. Không kèm file môi trường thực, kho credential, dữ liệu Emulator, screenshot vận hành, báo cáo nội bộ hoặc đường dẫn máy cá nhân. Định danh Firebase/Vercel và domain triển khai riêng được thay bằng placeholder; smoke check mặc định chỉ trỏ localhost. Icon PNG không có EXIF hoặc text metadata.

Gitleaks và rà soát định danh giúp giảm nguy cơ lộ dữ liệu, không phải bảo đảm tuyệt đối không có mọi loại thông tin nhạy cảm. Không thêm dữ liệu thật hoặc secret vào issue, PR hay commit khi phát triển tiếp.

## Đổi tên LessonBrook — 24/10/2026

Đã chạy lại lint, typecheck, 60 unit tests, Webpack build, 53 backend/Rules tests và 12 E2E: **125 kiểm thử qua** trên macOS với cùng phiên bản runtime/dependency đã khóa. Đã kiểm tra tiêu đề, tên hiển thị và bố cục 360px. Gitleaks 8.30.1 không phát hiện secret trong diff đổi tên hoặc lịch sử Git public; rà lại định danh deployment và đường dẫn cá nhân không có kết quả. Đây là bằng chứng cho bản source public, tách biệt với website đang vận hành.

## Theme tối — 25/10/2026

Command Line và Visual Code đã qua lint/typecheck/build cùng **125 kiểm thử local**. Kiểm tra bảy lựa chọn được lưu đúng tài khoản, tải lại, bố cục 360px, độ tương phản tối thiểu 4,5:1 cho chữ chính/phụ, giá trị biểu mẫu và nút chính trong hai theme tối. Bản xem trước bảng kê vẫn dùng nền sáng riêng. Đã xem dashboard và form học viên trên điện thoại/desktop bằng dữ liệu giả Emulator. Gitleaks không phát hiện secret trong thay đổi.
