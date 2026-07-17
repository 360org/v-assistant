# CHANGELOGS: Nhật ký Phát triển V-Assistant (Zero-Docker / Đa nền tảng)

Nhật ký ghi lại các cột mốc thay đổi kiến trúc và tái cấu trúc hệ thống.

## [1.2.0] - 2026-07-12
### Added
*   Đặc tả kiến trúc **Độc lập SDK (Universal Agent Loop)** loại bỏ hoàn toàn sự phụ thuộc vào `@anthropic-ai/claude-agent-sdk` và hỗ trợ đa nhà cung cấp (ChatGPT, Claude, Gemini, OpenRouter, LocalAI) trên cả 3 nền tảng macOS, Windows, Linux.
*   Thiết kế luồng cấu hình Agent bằng các file Markdown riêng biệt tương tự như Paperclip configuration.
*   Làm rõ vai trò của **Vault** làm module bảo mật mặc định (không phải connector) và các **Integrations/Connectors** kết nối vào Vault lấy credential an toàn.
*   Bổ sung đặc tả luồng chào mừng (Onboarding welcome screen) tự động bỏ qua sau khi đã đăng nhập lần đầu tiên thành công.
*   Thiết lập nền tảng cấu hình Tauri Launcher trong `runtime.rs` và `lib.rs` để tự khởi chạy NanoClaw nhúng dưới dạng Host Process.
