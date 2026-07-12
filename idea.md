# V-Assistant — Ý tưởng sản phẩm & Thiết kế Kiến trúc (Kế thừa NanoClaw & Đa nhà cung cấp)

> **Mục tiêu chốt chặn:** Xây dựng ứng dụng trợ lý cá nhân dạng Desktop Agentic cực nhẹ, hỗ trợ MacOS/Windows/Linux, kế thừa toàn bộ cấu trúc & tính năng agentic của NanoClaw (đọc/ghi file, thực thi lệnh Terminal, MCP tools) nhưng **loại bỏ sự lệ thuộc vào Anthropic Claude SDK** và **hỗ trợ Đa nhà cung cấp (ChatGPT, Claude, Gemini, OpenRouter, LocalAI)**.

Tài liệu này đặc tả ý tưởng sản phẩm cuối cùng và làm cơ sở rà soát duyệt trước khi viết mã nguồn.

---

## 1. Tầm nhìn & Nguyên lý thiết kế

1. **Kế thừa Kiến trúc NanoClaw:**
   * Giữ nguyên cơ chế giao tiếp qua database SQLite IPC (`inbound.db`/`outbound.db`) và quản lý session của NanoClaw để tránh viết lại từ đầu.
   * Đồng bộ hóa cấu hình Agent thông qua hệ thống nhóm (`groups`) và thư mục làm việc cục bộ.

2. **Decouple khỏi Anthropic SDK (Universal Agent Loop):**
   * Xóa bỏ thư viện `@anthropic-ai/claude-agent-sdk` trong Agent Runner.
   * Thay thế bằng một **Vòng lặp Agentic tùy chỉnh (Universal Agent Loop)** viết bằng TS thuần, có khả năng giao tiếp với API của mọi nhà cung cấp (OpenAI, Anthropic, Google Gemini, OpenRouter) bằng cùng một tập công cụ (Tools).

3. **Chạy trực tiếp siêu nhẹ (Zero-Docker / Host Process):**
   * Sử dụng cơ chế chạy nền trực tiếp làm tiến trình hệ thống (**Host Process** - thông qua `bun` hoặc `node` trên máy host).
   * Không bắt buộc cài đặt Docker/Colima khi cài app, giúp cài đặt cực kỳ đơn giản (Download > Install > Login > Dùng ngay).
   * Vẫn có khả năng thực thi các lệnh Terminal (qua công cụ `Bash` gọi tiến trình hệ thống) và sửa đổi file (qua công cụ `FileRead`, `FileWrite`, `FileEdit`...).
   * **Ví dụ luồng nghiệp vụ thực tế:** Người dùng ra lệnh: *"Em hãy thiết kế cho anh một chương trình quảng cáo Facebook"* -> Agent lập kế hoạch chiến dịch -> Người dùng cung cấp tài khoản/token liên kết từ Vault -> Agent tự động chạy chiến dịch qua API, tối ưu hóa ngân sách, theo dõi và xuất báo cáo tiến độ chi tiết cho người dùng.

---

## 2. Thiết kế Kiến trúc Agentic Độc lập SDK

```text
+--------------------------------------------------------------+
|            Tauri App (V-Assistant UI & Desktop Shell)        |
|  +------------------+                   +------------------+ |
|  |     React UI     |                   | Telegram Bot     | |
|  +--------+---------+                   +--------+---------+ |
|           | (Tauri IPC)                          | (fetch)   |
|  +--------v---------+                            |           |
|  |Rust Desktop Shell|                            |           |
|  +---+----------+---+                            |           |
|      |          |                                |           |
|      |          | (Local Encrypted DB)           |           |
|      |     +----v--------------------+           |           |
|      |     |  V-Assistant Vault      |           |           |
|      |     +-------------------------+           |           |
|      | (SQLite IPC)                              |           |
|  +---v-------------------------------------------v--------+  |
|  |              SQLite IPC Databases                      |  |
|  |  +-----------------------+    +---------------------+  |  |
|  |  | inbound.db (Messages) |    | outbound.db(Replies)|  |  |
|  |  +-----------+-----------+    +-----------^---------+  |  |
+--+--------------|----------------------------|------------+--+
                  | (Reads)                    | (Writes)
+-----------------|----------------------------|---------------+
|            Universal Agent Host Process (Bun Daemon)         |
|  +--------------v----------------------------+---------+   |
|  |                 Universal Agent Runner            |   |
|  +--------------------------+--------------------------+   |
|                             |                              |
|              +--------------v--------------+               |
|              |     Agent Loop Executor     |               |
|              +------+---------------+------+               |
|                     |               |                      |
|       +-------------v-----+   +-----v-------------+        |
|       |   Universal LLM   |   |   Native Tools    |        |
|       |      Client       |   | (Bash, FS, HTTP)  |        |
|       +---------+---------+   +---------+---------+        |
+-----------------|-----------------------|--------------------+
                  |                       |
        +---------v---------+   +---------v---------+
        |   AI Providers    |   |   External APIs   |
        | (ChatGPT, Gemini, |   | (Notion, Github,  |
        |  Claude, OR...)   |   |  Slack...)        |
        +-------------------+   +-------------------+
```

---

## 3. Bản đồ Tính năng & Checklist triển khai

### A. Giao diện & Đón tiếp (Onboarding)
*   **[ ] Luồng Login Ưu tiên (OAuth/Subscription First):** 
    * Chỉ hiển thị nút đăng nhập subscription OAuth khi chưa cấu hình.
    * Sau khi đã login lần đầu thì đã khai báo xong local user, các lần tiếp theo khi mở app sẽ tự động chạy thẳng vào giao diện làm việc chính mà không cần hiển thị lại màn hình chào mừng (Welcome) hay bắt đăng nhập lại.
*   **[ ] Advanced Options (API Key/Endpoint):** 
    * Chỉ xuất hiện để chỉnh sửa sau khi đã đăng nhập thành công.
*   **[ ] Trình quản lý Tiến trình ngầm tự động:**
    * Tauri App tự động kích hoạt `NanoClaw` chạy nền dưới dạng Host Process (`process`) khi mở app, không hỏi Docker/Colima.

### B. Universal Agent Loop (Agent-Runner)
*   **[ ] Thay thế Claude SDK:**
    * Phát triển module `universal-executor.ts` thực thi vòng lặp Agent: Gửi prompt -> nhận lệnh gọi tool -> chạy tool -> nạp lại lịch sử -> phản hồi.
*   **[ ] Công cụ Cục bộ tự chế (Native Tools):**
    * `Bash`: Thực thi lệnh qua `child_process.spawn`.
    * `FileRead` / `FileWrite` / `FileEdit`: Đọc, ghi và thay thế nội dung file thông qua module `fs` của Node/Bun.
    * `Grep` / `Glob`: Tìm kiếm file và nội dung nhanh chóng.
*   **[ ] Tự nâng cấp (Self-Improving Memory):**
    * Agent tự suy ngẫm sau mỗi cuộc hội thoại, cập nhật tóm tắt thông tin quan trọng vào file memory riêng của Agent để kế thừa cho các phiên chat sau.

### C. Kênh kết nối & Tích hợp (Telegram & Các kênh kết nối NanoClaw)
*   **[ ] Long-polling Telegram Bot & Các cổng Chat Adapter:**
    * Kế thừa đầy đủ cơ chế hoạt động của các kênh kết nối từ NanoClaw (mặc định tích hợp CLI, Telegram Bot).
    * Hỗ trợ cơ chế tự đăng ký của các cổng kết nối bổ sung (như Slack, Discord, WhatsApp...) thông qua Chat SDK Bridge để nhận tin nhắn, điều phối xử lý qua SQLite IPC và trả phản hồi về kênh tương ứng của người dùng.

### D. Agent (Bộ não độc lập & Tri thức RAG)
*   **[ ] Phân tách vai trò triệt để (Role Isolation):**
    * Mỗi Agent là một bộ não độc lập (định nghĩa bởi instructions + soul + memory riêng biệt). Việc chuyển đổi Agent không làm pha trộn dữ liệu.
    * Người dùng có thể tạo nhiều file markdown khác nhau để định nghĩa và cấu hình cho Agent, tương tự như cách khai báo trong cấu hình Paperclip (Paperclip configuration).
*   **[ ] Nạp tri thức cục bộ (Knowledge RAG):**
    * Hỗ trợ tải lên tài liệu (PDF, Word, Excel, PowerPoint, Text) cục bộ.
    * Tự động trích xuất nội dung (on-device parsing) và truy vấn ngữ cảnh (TF-IDF cục bộ) để đưa vào làm căn cứ câu trả lời cho Agent.

### E. Skills (Kỹ năng thực thi)
*   **[ ] Cài đặt & Khởi chạy Kỹ năng (Agent Skills):**
    * Kế thừa hệ thống Agent Skills chuẩn hóa (`skills/*/SKILL.md`). Inject hướng dẫn kỹ năng vào prompt của Agent khi kỹ năng đó được kích hoạt.
*   **[ ] Model Context Protocol (MCP Tools):**
    * Tích hợp máy chủ MCP bên ngoài và built-in (được khai báo qua `container.json`) để Agent tự do gọi và sử dụng các tools mở rộng bên ngoài.

### F. Kho bảo mật Vault & Tích hợp (Integrations & Connectors)
*   **[ ] Vault - Kho lưu trữ bảo mật mặc định:**
    * Là tính năng cốt lõi của V-Assistant (không phải lấy từ OS/keychain của macOS hay Windows). Đây là một cơ sở lưu trữ dữ liệu an toàn được mã hóa và quản lý trực tiếp bởi V-Assistant, chứa toàn bộ API Keys, tài khoản, Tokens và cấu hình tích hợp của người dùng.
*   **[ ] Tích hợp & Liên kết (Integrations & Connectors) kết nối vào Vault:**
    * Định nghĩa sẵn các cổng kết nối dịch vụ bên ngoài (GitHub, Notion, Slack, Discord, Telegram).
    * Các Integrations & Connectors này tự động kết nối vào Vault để truy xuất thông tin cấu hình và áp dụng xác thực tự động, giúp Agent thực thi tác vụ mà không làm lộ các khóa bảo mật gốc ra ngoài.
*   **[ ] Công cụ Web HTTP linh hoạt:**
    * Công cụ `http_request` giúp Agent gọi bất kỳ Webhook API nào, tự động thay thế placeholders dạng `{{vault:Name.field}}` cục bộ trước khi gửi yêu cầu đi.
