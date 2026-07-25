---
name: v-assistant-dev-guidelines
description: Quy chuẩn phát triển, quy trình đóng gói và lưu vết thay đổi dành cho dự án V-Assistant
---

# V-Assistant Agent Development & Workflow Guidelines

Quy chuẩn làm việc và bài học kinh nghiệm phát triển hệ thống V-Assistant (Zero-Docker / Tauri Desktop / Agent Runner Sidecar).

## 1. Quy trình Versioning & Release Discipline (QUY TẮC BẮT BUỘC)
* **Lưu vết CHANGELOGS & Git Commit**:
  - TẤT CẢ mọi thay đổi (sửa lỗi, thêm tính năng, tối ưu UI) **BẮT BUỘC phải ghi nhận ngay vào tệp `CHANGELOGS.md` dưới mục `[Unreleased]`** và commit lên git.
* **Quy tắc Tag Version & Build Release**:
  - **TUYỆT ĐỐI KHÔNG tự ý tag version** hay tạo release cho mỗi lỗi nhỏ/cải tiến lẻ tẻ.
  - **CHỈ KHI VÀ CHỈ KHI người dùng đưa ra câu lệnh yêu cầu chính thức** ("tag version", "build release", "merge to main & release"), Agent mới thực hiện bumping version, tạo Git Tag (`vX.Y.Z`) và đóng gói ứng dụng.

## 2. Đồng bộ hóa biên dịch Sub-modules & Sidecars (Sidecar Build Guard)
* **Biên dịch `agent-runner`**:
  - Module `agent-runner/` là Node.js sidecar độc lập có tệp output ở `agent-runner/dist/index.js`.
  - Mọi chỉnh sửa trong `agent-runner/src/` phải được biên dịch bằng `npx tsc --project agent-runner/tsconfig.json`.
  - Lệnh `build` trong `package.json` luôn chứa bước biên dịch `agent-runner` tự động.

## 3. Cơ chế Cấp quyền 1-Click (Interactive Permission Approval UX)
* **Không làm gián đoạn trải nghiệm người dùng (No UX Friction)**:
  - Khi Agent cần truy cập đường dẫn thư mục/tệp ngoài phạm vi mặc định, không yêu cầu người dùng mở Cài đặt cấu hình thủ công.
  - Tự động hiển thị **Permission Approval Card** trực quan trong giao diện Chat với nút bấm **[ Cho phép (Approve) ]** 1-Click.

## 4. Xử lý Đa định dạng Tài liệu & PDF Fallback
* **Bọc an toàn cho bóc tách tệp**:
  - Luôn bọc `try/catch` cho các bộ trích xuất dữ liệu (`extractPdf`, `extractText`).
  - Đối với tệp PDF dạng ảnh quét (Delivery Slip, Hóa đơn) không có text font thuần, tự động đăng ký dạng tài liệu asset tri thức `[Tệp PDF: ... | Dung lượng: ... KB]` với trạng thái `Ready` tức thì.

## 5. Quản lý Terminal Sandbox & Tiến trình ngầm
* **Chủ động xử lý Sandbox**:
  - Sử dụng `BypassSandbox: true` cho các lệnh biên dịch hệ thống (như `npm run build:local` đọc `~/.rustup`) hoặc lệnh `git push` đụng credential.
  - Luôn kiểm tra và ngắt (`manage_task kill`) các background task đã hoàn thành hoặc không còn dùng tới.
