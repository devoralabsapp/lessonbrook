# LessonBrook

[English](README.md) | **Tiếng Việt**

[![Checks](https://github.com/devoralabsapp/lessonbrook/actions/workflows/ci.yml/badge.svg)](https://github.com/devoralabsapp/lessonbrook/actions/workflows/ci.yml)

**Trạng thái:** bản mã nguồn public ở giai đoạn đầu, chưa có bằng chứng sử dụng rộng rãi bên ngoài. Xem [maintainer/quy trình bảo trì](MAINTAINERS.md), [roadmap](ROADMAP.md) và [changelog](CHANGELOG.md) (tiếng Anh).

Sổ buổi dạy và học phí tiếng Việt cho giáo viên tự do: cá nhân, nhóm hoặc lớp học; tính theo buổi và thu sau. Bạn có thể chạy trên máy, tự triển khai hoặc fork để phát triển theo nhu cầu của mình. Phát hành theo [MIT](LICENSE).

## Xem trước

![Màn hình tổng quan LessonBrook bằng tiếng Anh với giao diện Playful Retro Neo-Brutalism, các thẻ học phí pastel và một buổi dạy mẫu.](docs/images/dashboard-playful-retro.png)

Bản xem trước giao diện tiếng Anh · Playful Retro Neo-Brutalism · Chụp local bằng Firebase Emulator, chỉ dùng dữ liệu giả. Giao diện bản community hiện dùng tiếng Việt.

## Tính năng

- Đăng nhập Google; phiên server HttpOnly, kiểm tra thu hồi, CSRF và Origin.
- Học viên, đơn giá, lưu trữ/khôi phục; lớp tối đa 50 người và buổi nhóm với giá riêng được chụp tại thời điểm ghi.
- Bảng kê từng học viên, phát hành/hủy, thu từng phần và vô hiệu hóa khoản thu nhập sai.
- Link bảng kê có thời hạn/thu hồi; tổng quan, tìm kiếm, bộ lọc, CSV/ZIP/JSON và xóa tài khoản.
- Tám giao diện: Modern, Vintage, Art, Natura, Ocean, Command Line, Visual Code, Playful Retro Neo-Brutalism; bố cục tối ưu điện thoại. Command Line dùng nền đen và điểm nhấn xanh. Bấm chọn để xem thử ngay, chỉ lưu khi bấm Lưu giao diện. Hủy xem trước, rời cài đặt hoặc tải lại trang để bỏ lựa chọn chưa lưu.

Mọi đọc/ghi nghiệp vụ đi qua Node server API. Firebase client chỉ dùng cho Auth; Firestore Rules chặn client trực tiếp. Không có chế độ lưu học phí offline.

## Chạy local trong vài bước

Cần **Node.js 24.x**, npm, **Java 21** và Git. Dùng Node theo `.nvmrc`. Trên macOS, chọn đúng binary Intel (`x86_64`) hoặc Apple Silicon (`arm64`); nếu Java chưa được chọn, dùng `export JAVA_HOME="$(/usr/libexec/java_home -v 21)"` và thêm `$JAVA_HOME/bin` vào PATH. Windows có thể dùng WSL với công cụ cài trong WSL.

```bash
git clone https://github.com/devoralabsapp/lessonbrook.git
cd lessonbrook
npm ci
test -e .env.local || cp .env.example .env.local
npm run emulators
```

Chờ **All emulators ready**, rồi ở terminal thứ hai, cùng thư mục:

```bash
npm run dev
```

Mở **http://localhost:3000**. Dùng đúng `localhost`, vì APP_ORIGIN và relay Auth Emulator cần cùng hostname. Đăng nhập Google sẽ mở giao diện **Firebase Auth Emulator**, không phải Google cloud. Thêm tài khoản giả, không dùng thông tin thật.

Không cần tài khoản Google Cloud, Firebase project thật, service-account key hoặc Vercel để chạy local. `.firebaserc` mặc định là `demo-chotcong`. Lần đầu cần mạng để tải Emulator/Chromium.

### Dữ liệu mẫu

Khi Emulator đã sẵn sàng, terminal thứ ba:

```bash
npm run seed
```

Trong Google Emulator chọn **Add new account**, nhập email giả `mai@example.test`. Sổ mẫu gồm học viên Lan, 8 buổi × 200.000đ và 1 buổi hủy. Seed lặp lại an toàn. Guard chặn project thật hoặc host ngoài loopback.

Emulator UI: http://localhost:4100. Khi dừng Emulator bằng Ctrl+C, dữ liệu xuất vào `emulator-data/`; lần mở sau tự import. Thư mục này chỉ ở máy bạn và bị Git ignore. Xem [diễn tập backup local](docs/BACKUP_RESTORE.vi.md) nếu cần thử công cụ mã hóa/khôi phục dữ liệu giả.

Cổng mặc định: 3000 (web), 9099 (Auth), 8180 (Firestore), 4100 (UI), 4400/4500 (hub/logging), 9150 (websocket). Dừng đúng tiến trình mình sở hữu nếu cổng bận; dự án Firebase khác có thể dùng chung các cổng này.

## Kiểm thử

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:emulator
```

Dừng web/Emulator local của dự án trước `test:emulator`. Runner tự dựng môi trường demo, build Webpack, chạy backend/Rules/Playwright rồi dọn các tiến trình nó tạo. Không chuyển test/seed sang cloud. CI dùng Node 24/Java 21, không cần credential cloud.

Dev và build đều dùng Webpack. `typecheck` chạy Next typegen trước TypeScript. Framework có tài liệu tương ứng phiên bản tại `node_modules/next/dist/docs/`.

## Tự triển khai

Đọc [DEPLOYMENT](docs/DEPLOYMENT.vi.md). Bạn cần Firebase project, Google provider, database/Rules/indexes, hostname HTTPS và quyền IAM của riêng mình. Mã nguồn hỗ trợ Vercel OIDC/WIF để tránh private key. Các script cloud là template, cần cấu hình và rà soát target trước khi dùng; không chạy nguyên mẫu với dữ liệu thật.

Bản public độc lập, không chứa dữ liệu tài khoản, biến môi trường, lịch sử Git private, ảnh vận hành hoặc định danh cloud của bản triển khai khác. Việc đưa app lên hosting không tự chứng minh Google OAuth, IAM, HTTPS cookie, index cloud hay cài đặt trên thiết bị thật hoạt động.

## Phát triển tiếp

Xem [ARCHITECTURE](docs/ARCHITECTURE.vi.md), [CONTRIBUTING](CONTRIBUTING.vi.md) và [SECURITY](SECURITY.vi.md). Tiền là số nguyên VND, ngày nghiệp vụ theo Asia/Ho_Chi_Minh; giữ price snapshot, transaction idempotency và khóa `billedStatementId` khi sửa nghiệp vụ.

Giấy phép MIT áp dụng cho mã nguồn dự án. Dependency giữ giấy phép tương ứng; không bao gồm quyền đối với dịch vụ hoặc tài khoản của bên thứ ba. Các tên/email trong seed và fixture là dữ liệu giả.
