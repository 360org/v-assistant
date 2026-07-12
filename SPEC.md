# SPECIFICATION: Trợ lý Cá nhân Agentic V-Assistant (Zero-Docker / Đa nền tảng)

Tài liệu này đặc tả kỹ thuật, quy trình cài đặt, cơ chế đăng nhập và cách thức vận hành hệ thống V-Assistant hỗ trợ đa nền tảng (macOS, Windows, Linux).

---

## 1. Trải nghiệm người dùng (UX) & Đón tiếp (Onboarding)

*   **Tải & Cài đặt:** Người dùng tải gói đóng gói (`.dmg`, `.exe`, `.deb`) -> Chạy bộ cài -> Mở ứng dụng.
*   **Đăng nhập lần đầu (OAuth First):**
    *   Hộp thoại cấu hình mặc định chỉ hiển thị duy nhất nút **Đăng nhập bằng OAuth (Subscription)**.
    *   Sau khi xác thực thành công qua trình duyệt hệ thống (luồng Loopback OAuth), hệ thống lưu thông tin và khởi tạo **local user** trong ứng dụng.
*   **Trải nghiệm các lần khởi chạy tiếp theo:**
    *   Khi ứng dụng được mở lại, Tauri kiểm tra sự tồn tại của local user.
    *   Nếu đã tồn tại, ứng dụng bỏ qua màn hình chào mừng (Welcome/Onboarding) và chuyển thẳng vào giao diện làm việc chính.
*   **Cấu hình nâng cao (Advanced Options):**
    *   Chỉ xuất hiện đối với tài khoản đã kết nối thành công. 
    *   Cho phép người dùng cấu hình thủ công API Key/Endpoint riêng nếu không muốn sử dụng gói dịch vụ Subscription dùng chung.

---

## 2. Thiết kế Cấu hình Agent dạng Markdown (Paperclip-style)

*   Mỗi Agent hoạt động như một vai trò (Role) với bộ não hoàn toàn tách biệt.
*   Người dùng định cấu hình Agent bằng cách tạo hoặc import các file Markdown (tương tự Paperclip configuration).
*   **Cấu trúc file Markdown cấu hình Agent:**
    *   `Instructions` (Hướng dẫn nghiệp vụ): Xác định quy trình và các bước thực thi công việc.
    *   `Soul` (Tính cách/Phong cách): Định hình giọng điệu, phản hồi của AI.
    *   `Memory` (Bộ nhớ lâu dài): Nơi Agent tự động phản tư và lưu trữ thông tin trích xuất sau mỗi cuộc hội thoại.
*   **Cô lập hoàn toàn:** Chuyển đổi Agent không pha trộn dữ liệu. Mỗi Agent có Instructions, Soul, Memory, Knowledge riêng biệt.

---

## 3. Đặc tả API trực tiếp các nhà cung cấp AI (Direct Native API)

Ứng dụng kết nối trực tiếp đến các cổng API chính chủ của nhà cung cấp để tối ưu hóa tốc độ và bảo mật thông tin:

| Provider | Endpoint | Giao thức |
|----------|----------|-----------|
| Anthropic (Claude) | `https://api.anthropic.com/v1/messages` | Anthropic Messages API |
| OpenAI (ChatGPT) | `https://api.openai.com/v1/chat/completions` | OpenAI-compatible |
| Google (Gemini) | `https://generativelanguage.googleapis.com/v1beta/models/...` | Gemini streamGenerateContent |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | OpenAI-compatible |
| LocalAI / Ollama | `http://localhost:11434/v1` (tuỳ chỉnh) | OpenAI-compatible |

Tất cả adapters đều hỗ trợ **streaming response** và **tool calling / function calling** chuẩn hóa chung qua Universal LLM Client.

---

## 4. Đặc tả Quy trình Vận hành Nền tảng (Silent Host Process)

Để đảm bảo hiệu năng và không phụ thuộc Docker:

1.  **Spawn Engine ngầm:** 
    *   Tauri App (Rust backend) tự động kiểm tra thư mục Agent Runner nhúng trong Resources.
    *   Khởi chạy tiến trình Universal Agent Runner bằng Bun/Node trực tiếp trên hệ điều hành máy host.
    *   Đặt biến môi trường:
        ```bash
        CONTAINER_RUNTIME_BIN=process
        VUA_DATA_DIR=~/.v-assistant
        VUA_IPC_DIR=~/.v-assistant/ipc
        ```
2.  **Thao tác Hệ thống & File:**
    *   Do chạy ở chế độ Host Process, Agent Runner có toàn quyền:
        *   Gọi lệnh shell (tool `Bash` → `child_process.spawn`)
        *   Đọc/ghi/sửa file (tools `FileRead`, `FileWrite`, `FileEdit` → native `fs` module)
        *   Tìm kiếm file & nội dung (tools `Grep`, `Glob`)
    *   Không cần cầu nối container Docker.
3.  **Health Check & Auto-restart:**
    *   Tauri định kỳ kiểm tra Agent Runner process còn sống.
    *   Tự động restart nếu process crash.
    *   Graceful shutdown khi thoát app (gửi SIGTERM).
4.  **Fallback Engine nhúng:**
    *   Khi Agent Runner chưa khởi động hoặc ở Demo Mode, UI sử dụng engine nhúng (gọi trực tiếp provider API từ Webview).

---

## 5. Đặc tả Hệ thống Bảo mật Vault & Liên kết Dịch vụ (Integrations)

*   **Vault là tính năng cốt lõi mặc định:** 
    *   Là hệ thống lưu trữ bảo mật cốt lõi, chạy mặc định và tích hợp trực thuộc hệ thống V-Assistant (không phải là connector và không phụ thuộc vào Keychain của macOS/Windows).
    *   Tự động mã hóa AES-256 và quản lý dữ liệu nhạy cảm cục bộ (API Keys, Access Tokens của Slack, Notion, GitHub, tài khoản liên kết...).
    *   Lưu trữ tại `~/.v-assistant/vault.db` (SQLite mã hóa) hoặc Tauri app data directory.
*   **Liên kết không lộ thông tin (Connectors Auth):**
    *   Các Integrations/Connectors kết nối vào Vault cục bộ để lấy credential và áp dụng chữ ký xác thực API tự động.
    *   Model AI chỉ nhìn thấy tên trường credential dưới dạng placeholders (ví dụ `{{vault:Github.token}}`) mà không bao giờ tiếp cận được khóa bảo mật gốc.
    *   Giá trị thật được thay thế tại chỗ bởi executor ngay trước khi gửi HTTP request.

---

## 6. Kênh kết nối đa phương tiện & Lập lịch Công việc (Channels & Scheduled Tasks)

*   **Đa kênh kết nối kế thừa từ NanoClaw:**
    *   Mặc định hỗ trợ kênh dòng lệnh CLI cục bộ (`cli`) và kênh Telegram Bot (`telegram`).
    *   Tích hợp thông qua cơ chế tự đăng ký của Chat SDK Bridge, cho phép mở rộng nhanh chóng sang Slack, Discord, WhatsApp,...
    *   Message từ bất kỳ kênh nào đến -> Adapter ghi vào `inbound.db` -> Agent Runner xử lý -> kết quả ghi vào `outbound.db` -> Adapter đọc và trả về đúng kênh người dùng tương ứng.
*   **Scheduled Tasks:**
    *   Trình lập lịch kiểm tra mỗi phút và kích hoạt Agent thực thi các kỹ năng tự động theo chu kỳ thời gian.
    *   Kết quả giao vào chat UI + gửi qua Telegram (nếu đã kết nối).

---

## 7. Đặc tả Skills & MCP (Model Context Protocol)

*   **Agent Skills:**
    *   Hệ thống kỹ năng chuẩn hóa `skills/*/SKILL.md`.
    *   Inject hướng dẫn kỹ năng vào system prompt khi kích hoạt.
    *   Per-role skill sets: mỗi Agent có thể gán bộ skill riêng.
*   **MCP Tools:**
    *   Tích hợp MCP Client trong Agent Runner.
    *   Khai báo MCP servers qua config file.
    *   Agent tự discovery & gọi MCP tools mở rộng.

---

## 8. Đặc tả Self-Improving Memory

*   **Hermes-style Memory:**
    *   Agent tự suy ngẫm sau mỗi cuộc hội thoại.
    *   Trích xuất thông tin quan trọng → lưu vào file memory riêng per-Agent (markdown).
    *   Memory kế thừa cho các phiên chat sau, giúp Agent "nhớ" người dùng.
*   **Knowledge RAG per-role:**
    *   Upload tài liệu (PDF, Word, Excel, PowerPoint, Text).
    *   Trích xuất on-device → chunks → truy vấn TF-IDF cục bộ.
    *   Knowledge cô lập per-role: role này không thấy knowledge role khác.
