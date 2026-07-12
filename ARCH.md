# ARCHITECTURE GUIDE: Kiến trúc V-Assistant (Universal Agent Runner — Zero-Docker)

Tài liệu này mô tả chi tiết sơ đồ thiết kế kiến trúc, cấu trúc các thành phần và cách thức hoạt động của hệ thống trợ lý cá nhân V-Assistant chạy trực tiếp trên MacOS, Windows và Linux.

---

## 1. Sơ đồ Kiến trúc Tổng thể

```text
+-------------------------------------------------------------+
|               USER INTERFACE & TAURI CORE                    |
|  +------------------+                   +----------------+   |
|  |     React UI     |                   |Telegram/Channel|   |
|  +--------+---------+                   +-------+--------+   |
|           | (Tauri IPC)                         | (fetch)    |
|  +--------v---------+                           |            |
|  | Tauri Rust Core  |                           |            |
|  +---+----------+---+                           |            |
|      |          |                               |            |
|      |          | (Secure Storage)              |            |
|      |    +-----v---------------+               |            |
|      |    | V-Assistant Vault   |               |            |
|      |    | (Built-in Encrypted)|               |            |
|      |    +---------------------+               |            |
|      | (SQLite IPC)                             |            |
|  +---v------------------------------------------v--------+   |
|  |              SQLITE IPC DATABASES                     |   |
|  |  +-----------------------+   +---------------------+  |   |
|  |  |      inbound.db       |   |     outbound.db     |  |   |
|  |  +-----------+-----------+   +-----------^---------+  |   |
+--+--------------|---------------------------|------------+---+
                  | (Reads)                   | (Writes)
+-----------------|---------------------------|---------------+
|          UNIVERSAL AGENT HOST PROCESS (BUN/NODE)            |
|                                                             |
|  +-------------------+  +---------------------+             |
|  | Agent Config      |  | Agent Memory        |             |
|  | (Instructions.md  |  | (per-agent .md)     |             |
|  |  Soul.md)         |  +---------------------+             |
|  +-------------------+                                      |
|                                                             |
|  +------------------------------------------------------+   |
|  |              Universal Agent Runner                   |   |
|  +---------------------------+---------------------------+   |
|                              |                               |
|              +---------------+---------------+               |
|              | (Query / Execute)             |               |
|     +--------v--------+            +--------v--------+      |
|     |  Universal LLM  |            |  Native Tools   |      |
|     |     Client      |            | (Bash, FS, HTTP,|      |
|     |                 |            |  Grep, Glob)    |      |
|     +--------+--------+            +--------+--------+      |
+--------------|-------------------------------|---------------+
               |                               |
      +--------v--------+            +--------v--------+
      |   AI Providers  |            | External APIs   |
      | (ChatGPT, Claude|            | (Notion, Github |
      |  Gemini, OR,    |            |  Slack, Discord)|
      |  LocalAI)       |            +-----------------+
      +-----------------+
```

---

## 2. Các Thành phần Hệ thống Cốt lõi

### 2.1. Tauri Rust Core (Shell quản lý hệ thống)

**Chức năng:** Đóng gói giao diện React, quản lý bảo mật Vault, và điều phối vòng đời của Agent Runner process.

**Vai trò cụ thể:**
*   Khởi chạy & giám sát tiến trình ngầm Universal Agent Runner (Bun/Node) trên máy host (`CONTAINER_RUNTIME_BIN=process`).
*   Quản lý Vault bảo mật nội bộ (mã hóa AES-256, không phụ thuộc OS Keychain).
*   Xử lý luồng Loopback OAuth (desktop authentication).
*   Health check & auto-restart Agent Runner nếu crash.
*   Graceful shutdown khi thoát app.

### 2.2. SQLite IPC (Kênh giao tiếp liên tiến trình)

Cơ chế giao tiếp giữa React UI / Channel Adapters với Agent Runner:

*   **inbound.db:** Hàng đợi tin nhắn từ người dùng (React UI, Telegram, CLI, Slack...) ghi vào → Agent Runner đọc và xử lý.
*   **outbound.db:** Kết quả phản hồi của Agent (streaming chunks hoặc message hoàn chỉnh) → UI đọc và hiển thị.

**Luồng dữ liệu:**
```text
User/Channel → ghi vào inbound.db → Agent Runner poll & xử lý
                                          ↓
                                    Gọi LLM API
                                          ↓
                                    Thực thi Tools
                                          ↓
Agent Runner ghi vào outbound.db → UI poll & hiển thị ← User
```

### 2.3. Universal Agent Runner (Trình thực thi Agentic đa nhà cung cấp)

Tiến trình nền chạy độc lập trên máy host (Bun hoặc Node.js), **hoàn toàn loại bỏ sự phụ thuộc vào Anthropic Claude SDK**.

**Vòng lặp Agentic (Agent Loop):**
1.  Poll `inbound.db` để đọc tin nhắn mới.
2.  Nạp ngữ cảnh Agent:
    *   **Instructions** (file `.md`): Quy trình & bước thực thi công việc.
    *   **Soul** (file `.md`): Tính cách, giọng điệu phản hồi.
    *   **Memory** (file `.md` per-agent): Bộ nhớ lâu dài, tự cập nhật sau mỗi cuộc hội thoại.
    *   **Knowledge** (RAG per-role): Trích xuất tài liệu → chunks → truy vấn TF-IDF.
    *   **Skills** (`SKILL.md`): Kỹ năng đang kích hoạt.
3.  Gửi yêu cầu tới AI provider qua **Universal LLM Client**.
4.  Nếu AI yêu cầu tool call:
    *   `Bash`: Khởi chạy shell con trực tiếp trên host OS.
    *   `FileRead`/`FileWrite`/`FileEdit`: Đọc/ghi/sửa file cục bộ.
    *   `Grep`/`Glob`: Tìm kiếm file & nội dung.
    *   `http_request`: Gọi API với Vault placeholder resolution.
    *   `vault_list`: Liệt kê credential (chỉ tên, không giá trị).
    *   `connector_call`: Gọi Integration/Connector đã đăng ký.
    *   Gửi kết quả tool quay lại LLM, tiếp tục vòng lặp.
5.  Ghi câu trả lời cuối cùng vào `outbound.db`.

### 2.4. Universal LLM Client (Đa nhà cung cấp)

Giao diện API thống nhất gọi trực tiếp đến các cổng API chính chủ:

| Provider | Endpoint | Giao thức |
|----------|----------|-----------|
| OpenAI (ChatGPT) | `api.openai.com/v1/chat/completions` | OpenAI-compatible |
| Anthropic (Claude) | `api.anthropic.com/v1/messages` | Anthropic Messages |
| Google (Gemini) | `generativelanguage.googleapis.com/v1beta/...` | Gemini Stream |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | OpenAI-compatible |
| LocalAI / Ollama | `localhost:11434/v1` (tuỳ chỉnh) | OpenAI-compatible |

Tất cả adapters đều hỗ trợ **streaming** và **tool calling / function calling** chuẩn hóa chung.

### 2.5. Vault bảo mật (Tính năng cốt lõi)

**Vault là tính năng cốt lõi của V-Assistant**, chạy mặc định và tích hợp trực thuộc hệ thống (không phải connector, không phụ thuộc OS Keychain).

*   Tự mã hóa AES-256 và giải mã thông tin tài khoản người dùng.
*   Lưu trữ: API Keys, Access Tokens, tài khoản liên kết, cấu hình tích hợp.
*   Agent chỉ thấy **tên field** (placeholder `{{vault:Name.field}}`), giá trị thật được thay thế tại chỗ bởi executor trước khi gửi HTTP request.

### 2.6. Integrations & Connectors

**Connectors** đóng vai trò client kết nối vào Vault:
*   Lấy access token từ Vault → áp dụng xác thực tự động vào HTTP request.
*   Khóa bảo mật không bao giờ lộ ra ngoài hay gửi lên model AI.
*   Định nghĩa sẵn: GitHub, Notion, Slack, Discord, Telegram.
*   Mở rộng qua cơ chế plugin connector.

### 2.7. Channel Adapters (Đa kênh kết nối)

Kế thừa kiến trúc NanoClaw, hỗ trợ đa kênh:

*   **CLI**: Kênh dòng lệnh cục bộ (mặc định).
*   **Telegram Bot**: Long-polling 2 chiều.
*   **Chat SDK Bridge**: Cơ chế tự đăng ký adapter → mở rộng sang Slack, Discord, WhatsApp.
*   **Luồng chung**: Message từ kênh → Adapter → `inbound.db` → Agent xử lý → `outbound.db` → Adapter → trả phản hồi đúng kênh.

---

## 3. Cấu trúc Thư mục Dự án

```text
v-assistant/
├── src/                        # React UI (frontend)
│   ├── pages/                  # 10 trang: Home, Chat, Agents, Skills...
│   ├── components/             # Shared UI components
│   ├── lib/                    # State management, catalog, utils
│   └── runtime/                # Engine nhúng (fallback / legacy)
│       ├── engine.ts           # Engine selector
│       ├── providers.ts        # Multi-provider streaming
│       ├── tools.ts            # Agent tools
│       ├── vault.ts            # Vault client
│       ├── connectors.ts       # Connector plugins
│       ├── knowledge.ts        # RAG per-role
│       ├── telegram.ts         # Telegram channel
│       ├── scheduler.ts        # Scheduled tasks
│       ├── selfImprove.ts      # Hermes-style memory
│       ├── oauth.ts            # OAuth handling
│       └── nanoclaw.ts         # NanoClaw IPC bridge
├── src-tauri/                  # Tauri Rust backend
│   └── src/
│       ├── lib.rs              # Tauri app setup
│       ├── runtime.rs          # Engine process manager
│       ├── vault.rs            # Vault Tauri commands
│       ├── auth.rs             # Loopback OAuth
│       └── sandbox.rs          # WASM sandbox (optional)
├── agent-runner/               # Universal Agent Runner (Bun/Node)
│   └── src/
│       ├── index.ts            # Entry point / daemon
│       ├── universal-llm-client.ts  # Multi-provider API client
│       ├── universal-executor.ts    # Agent loop
│       ├── native-tools/       # Bash, FS, HTTP, Grep, Glob
│       ├── db/                 # SQLite IPC schemas
│       └── providers/          # Per-provider adapters
├── skills/                     # Built-in Agent Skills
├── scripts/                    # Test & build scripts
├── idea.md                     # Ý tưởng sản phẩm
├── SPEC.md                     # Đặc tả kỹ thuật
├── ARCH.md                     # Tài liệu kiến trúc (file này)
├── CHECKLIST.md                # Checklist tính năng tổng thể
└── ...
```

---

## 4. Quyết định Kiến trúc Quan trọng

1.  **Bỏ Docker cho người dùng cuối.** Engine chạy nhúng hoặc Host Process. Docker chỉ là đường nâng cao tùy chọn qua `VUA_ENGINE_DIR`.
2.  **Đa vai trò, không đa tiến trình.** Chuyển vai trò Agent = chuyển state cô lập (memory/knowledge riêng), khởi động tức thì, 0 thời gian chờ.
3.  **Universal Agent Loop thay Claude SDK.** Tự viết vòng lặp agentic bằng TypeScript thuần, gọi trực tiếp API từng vendor — không phụ thuộc SDK nào.
4.  **Vault nội bộ, không phụ thuộc OS.** Mã hóa AES-256, quản lý bởi V-Assistant. Agent chỉ thấy placeholder, secret thay tại chỗ.
5.  **Sandbox = WASM (Wasmtime), tùy chọn.** Feature flag `--features sandbox`, off mặc định. Guest không có host import, trần bộ nhớ + fuel.
6.  **Giữ engine nhúng làm fallback.** Khi Agent Runner chưa khởi động hoặc trong Demo Mode, UI vẫn gọi trực tiếp provider qua engine nhúng.
