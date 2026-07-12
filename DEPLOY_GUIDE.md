# DEPLOYMENT GUIDE: Hướng dẫn Đóng gói & Triển khai Đa nền tảng (Zero-Docker)

Tài liệu này hướng dẫn cách đóng gói ứng dụng V-Assistant kèm theo động cơ Agentic nhúng NanoClaw (chế độ Host Process) hỗ trợ đầy đủ các hệ điều hành: macOS, Windows và Linux.

---

## 1. Chuẩn bị Tài nguyên đóng gói (Embedded Assets)

Tauri App sẽ đóng gói toàn bộ thư mục `NanoClaw` (trong đó chứa Agent Runner và các file thực thi Bun) vào trong tài nguyên cài đặt (`resources`) của ứng dụng để đảm bảo cài đặt một bước chạy ngay.

### Cấu hình `tauri.conf.json`
Thêm thư mục NanoClaw vào danh sách tài nguyên bundle:
```json
{
  "bundle": {
    "resources": [
      "../NanoClaw/**/*"
    ]
  }
}
```

---

## 2. Quản lý Quy trình Khởi chạy trong Rust (`runtime.rs`)

Khi đóng gói phiên bản Release (Production), Tauri tự động định vị tài nguyên cài đặt và khởi chạy daemon nền:
```rust
// Định vị thư mục tài nguyên nhúng
let resource_dir = app_handle.path().resource_dir()?;
let engine_dir = resource_dir.join("NanoClaw");

// Khởi chạy tiến trình Bun/Node trực tiếp trên máy host
Command::new("node")
    .arg(engine_dir.join("dist/index.js"))
    .env("CONTAINER_RUNTIME_BIN", "process") // Chạy ở chế độ Host Process
    .env("VUA_RUNTIME_DIR", &runtime_dir)
    .spawn()?;
```

---

## 3. Quy trình Biên dịch cho từng Hệ điều hành (Build Commands)

### 3.1. Biên dịch trên macOS (DMG / APP)
Yêu cầu: Xcode Command Line Tools.
```bash
# Cài đặt các thư viện cần thiết
npm install
# Build ứng dụng tauri
npm run tauri build
```
*Kết quả:* File bộ cài `.dmg` và ứng dụng `.app` nằm tại thư mục `src-tauri/target/release/bundle/dmg/`.

### 3.2. Biên dịch trên Windows (MSI / EXE)
Yêu cầu: WiX Toolset v3.
```bash
npm run tauri build
```
*Kết quả:* Bộ cài đặt Windows Installer `.msi` nằm tại thư mục `src-tauri/target/release/bundle/msi/`.

### 3.3. Biên dịch trên Linux (DEB / AppImage)
```bash
npm run tauri build
```
*Kết quả:* Gói cài đặt `.deb` nằm tại thư mục `src-tauri/target/release/bundle/deb/`.
