# V-Assistant — Checklist Tính năng Tổng thể

> **Nguồn tham chiếu chéo:**
> - [NanoClaw](file:///Volumes/DATA/DEV/NanoClaw) — Agent Runner, Poll Loop, SQLite IPC, MCP Tools, Channels, Provider Registry
> - [Hermes](file:///Volumes/DATA/DEV/hermes) — Agent Souls, Memory, Dashboard, Gateway, 9router integration
> - [Claw (GitLab)](file:///Volumes/DATA/DEV/claw) — Script quản trị, Telegram Webhook, Docker deployment, Security patterns
> - [9router](file:///Volumes/DATA/DEV/9router-temp) — AI Router proxy, Multi-provider, RTK Token Saver, Skills, OAuth, MCP
>
> **Quy ước:**
> - `[x]` = Đã hoàn thành & có test
> - `[~]` = Đã có code nhưng cần refactor/cập nhật cho kiến trúc mới
> - `[ ]` = Chưa triển khai
> - `[REF: ...]` = Tham chiếu file/module gốc cần kế thừa
>
> *Cập nhật lần cuối: 2026-07-12*

---

## 1. Tài liệu & Quy chuẩn Dự án

- [x] `README.md` — Giới thiệu dự án & hướng dẫn sử dụng
- [x] `SPEC.md` — Đặc tả kỹ thuật & yêu cầu chức năng
- [x] `ARCH.md` — Tài liệu kiến trúc hệ thống
- [x] `DEPLOY_GUIDE.md` — Hướng dẫn triển khai
- [x] `CHANGELOGS.md` — Nhật ký phát triển module
- [x] `CHANGELOG.md` — Lịch sử thay đổi theo phiên bản
- [x] `PROJECT-HISTORY.md` — Lịch sử toàn bộ hành trình dự án
- [x] `DEVELOPMENT.md` — Quy trình phát triển cho developer
- [x] `idea.md` — Ý tưởng sản phẩm & thiết kế kiến trúc tầm nhìn
- [x] Đồng bộ lại tất cả tài liệu khớp 100% với kiến trúc Universal Agent Runner mới
- [x] Cập nhật `PROJECT-HISTORY.md` ghi nhận quyết định chuyển sang Universal Agent Loop

---

## 2. Giao diện Desktop (Tauri + React)

### 2.1 Khung ứng dụng & Điều hướng
- [x] Tauri 2 desktop shell (Rust backend)
- [x] React 18 + Vite 6 + TypeScript + TailwindCSS + Framer Motion
- [x] Sidebar navigation responsive (mobile drawer + desktop fixed)
- [x] Animated page transitions (AnimatePresence)
- [x] Menu đầy đủ: Home, Chat, Agents, Skills, Knowledge, Vault, Scheduled, Integrations, Settings
- [x] Logo vương miện + đầu AI (360org branding)

### 2.2 Trang Chat
- [x] Giao diện chat streaming real-time
- [x] Hiển thị typing indicator
- [x] Chuyển đổi provider trong 1 click
- [x] Chọn Agent/Role khi chat
- [x] Chọn Skill khi chat
- [x] Chuyển từ gọi engine nhúng trực tiếp → giao tiếp qua SQLite IPC (cho kiến trúc mới)
  `[REF: NanoClaw/container/agent-runner/src/db/messages-in.ts + messages-out.ts]`

### 2.3 Trang Agents
- [x] Danh sách Agent với agent store catalog
- [x] Cấu hình Instructions (hướng dẫn nghiệp vụ) per-agent
- [x] Cấu hình Soul (tính cách/phong cách) per-agent
- [x] Cấu hình Memory (bộ nhớ lâu dài) per-agent
- [x] Cô lập vai trò: chuyển Agent không pha trộn dữ liệu
- [x] Import file markdown cấu hình Agent (persona "The Agency") từ URL →
      Agent (name/description/emoji/soul/instructions), cài & kích hoạt ngay.
      `src/runtime/agentImport.ts` · test `scripts/agent-import-check.mjs`
- [x] Người dùng nhập nhiều file markdown để định nghĩa Agent (dán URL trong
      Agent Store → "Nhập từ URL"). Tương thích bộ msitarzewski/agency-agents (230+ agent)
- [ ] Export cấu hình Agent ra file markdown

### 2.4 Trang Skills
- [x] Hiển thị danh sách built-in skills (10 skills)
- [x] Cài đặt skill từ URL (raw SKILL.md)
- [x] Validate skills khi build (`validate-skills.mjs`)
- [x] Inject skill instructions vào prompt Agent Runner (cần cập nhật cho IPC)
- [x] Per-role skill sets (mỗi Agent có bộ skill riêng)
  `[REF: NanoClaw/src/group-skills.ts — quản lý skill per-group]`

### 2.5 Trang Knowledge
- [x] Upload tài liệu: PDF, Word, Excel, PowerPoint, Text
- [x] Trích xuất nội dung on-device (parsing cục bộ)
- [x] Chia nhỏ thành chunks & lập chỉ mục
- [x] Truy vấn TF-IDF cục bộ
- [x] Knowledge cô lập per-role (role này không thấy knowledge role khác)
- [x] RAG: inject excerpts vào prompt dựa trên câu hỏi

### 2.6 Trang Vault
- [x] CRUD credential (tạo/đọc/sửa/xóa)
- [x] Field động: chọn kiểu dữ liệu (text/password/number/url/email/date/datetime) + icon
- [x] Vault hiện dùng OS Keychain → cần chuyển sang V-Assistant Vault nội bộ (mã hóa riêng)

### 2.7 Trang Scheduled
- [x] Lập lịch tác vụ (cron expression / interval)
- [x] Agent tự chạy theo lịch
- [x] Giao kết quả vào chat + Telegram
- [ ] UI quản lý lịch sử chạy / logs per-task
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/scheduling.ts — scheduling MCP tools]`

### 2.8 Trang Integrations
- [x] Hiển thị danh sách integration templates
- [x] Connectors đọc Vault, tự áp auth
- [ ] Wizard kết nối từng bước cho connector mới
- [ ] Trạng thái connected / disconnected realtime

### 2.9 Trang Settings & Onboarding
- [x] Chọn AI provider, cấu hình model, API Key / Base URL
- [x] Onboarding: OAuth login, local user, bỏ qua Welcome lần sau
- [x] Đồng bộ hóa React state & Vault lưu trên host qua Vite API dev middleware (tránh mất kết nối khi đổi trình duyệt)
- [x] Tự động tải thẳng vào trang Chat (thay vì Home) khi onboarded = true
- [x] Quản lý phiên đăng nhập và yêu cầu đăng nhập lại khi session hết hạn
- [ ] Theme / Language settings
- [ ] Data export / import

---

## 3. Đăng nhập & Xác thực (Authentication)

- [x] Loopback OAuth desktop (PKCE) qua trình duyệt hệ thống
- [x] Đăng nhập qua OpenRouter (1-click OAuth)
- [x] Đăng nhập trực tiếp vendor: ChatGPT / Claude / Gemini (dán API key)
- [x] Local user creation sau OAuth thành công
- [ ] Native OAuth flow cho từng vendor (không cần dán key thủ công)
  `[REF: 9router/src/lib/oauth/ — OAuth flows cho nhiều provider]`
- [ ] OAuth Drive / Outlook / Calendar
- [ ] Token refresh tự động

---

## 4. AI Providers — Đa nhà cung cấp

### 4.1 Streaming & API hiện có (Engine nhúng Webview)
- [x] OpenAI-compatible streaming (ChatGPT, OpenRouter, LocalAI)
- [x] Anthropic Messages API streaming (Claude)
- [x] Google Gemini streamGenerateContent
- [x] OpenRouter auto-routing
- [x] LocalAI / Ollama (endpoint localhost tuỳ chỉnh)
- [x] Model override cho từng provider

### 4.2 Tích hợp 9router (AI Router Proxy)
- [ ] Kết nối đến 9router local (`http://localhost:20128/v1`) như một provider
  `[REF: 9router/src/proxy.js + src/lib/network/ — routing logic]`
- [ ] RTK Token Saver — auto-compress tool_result, tiết kiệm 20-40% token
  `[REF: 9router/src/sse/ — server-sent events + token compression]`
- [ ] Multi-account round-robin giữa nhiều API key/provider
  `[REF: 9router/src/lib/headroom/ — quota tracking & fallback tiers]`
- [ ] Auto-fallback: Subscription → Cheap → Free (zero downtime)
  `[REF: 9router architecture: Tier 1 → Tier 2 → Tier 3]`
- [ ] Provider normalization (OpenAI ↔ Claude format translation)
  `[REF: 9router/src/lib/providerNormalization.js]`

---

## 5. Universal Agent Runner (Host Process)

> **Trạng thái: HOÀN THÀNH** — Đã kế thừa và tối ưu hóa kiến trúc từ `NanoClaw/container/agent-runner/`
> chạy hoàn toàn không cần Docker.

### 5.1 Khung dự án
- [x] Tạo thư mục `agent-runner/` trong repo
- [x] `package.json` (Bun/Node compatible)
  `[REF: NanoClaw/container/agent-runner/ — project structure]`
- [x] Cấu hình TypeScript riêng
- [x] Entry point: `index.ts` — khởi động daemon poll loop
  `[REF: NanoClaw/container/agent-runner/src/index.ts — main entry + config loading]`

### 5.2 Config system
- [x] `config.ts` — đọc `container.json` (provider, assistantName, mcpServers, model, effort)
  `[REF: NanoClaw/container/agent-runner/src/config.ts — RunnerConfig interface]`
- [x] Hỗ trợ đọc config từ Tauri app data directory thay vì `/workspace/agent/`

### 5.3 Universal LLM Client (Thay thế Claude SDK)
- [x] Provider Registry pattern (factory + self-registration)
  `[REF: NanoClaw/container/agent-runner/src/providers/provider-registry.ts]`
  `[REF: NanoClaw/container/agent-runner/src/providers/factory.ts — createProvider()]`
- [x] `AgentProvider` interface thống nhất
  `[REF: NanoClaw/container/agent-runner/src/providers/types.ts — AgentProvider, AgentQuery, ProviderEvent]`
- [x] Adapter OpenAI-compatible (ChatGPT, OpenRouter, LocalAI/Ollama)
- [x] Adapter Anthropic Messages API (Claude) — **KHÔNG dùng Claude Agent SDK**
  `[REF: NanoClaw/container/agent-runner/src/providers/claude.ts — hiện dùng SDK, cần viết lại bằng API trực tiếp]`
- [x] Adapter Google Gemini (streamGenerateContent)
- [x] Streaming support cho tất cả adapters (AsyncIterable<ProviderEvent>)
- [x] Tool call / function calling chuẩn hoá chung
- [x] Continuation/session management (resume giữa các lần poll)
  `[REF: NanoClaw poll-loop.ts L89-L112 — continuation management + rotation]`

### 5.4 Poll Loop (Vòng lặp chính)
- [x] `poll-loop.ts` — poll `inbound.db` → format → query provider → write `outbound.db`
  `[REF: NanoClaw/container/agent-runner/src/poll-loop.ts — 696 dòng, logic đầy đủ]`
- [x] Heartbeat liveness detection
  `[REF: NanoClaw/container/agent-runner/src/db/connection.ts — touchHeartbeat()]`
- [x] Command handling (/clear, /upload-trace)
  `[REF: NanoClaw poll-loop.ts L158-L191 — command detection]`
- [x] Message formatting & routing extraction
  `[REF: NanoClaw/container/agent-runner/src/formatter.ts — formatMessages, extractRouting]`
- [x] Accumulate gate (trigger=0 context-only, trigger=1 wake-eligible)
  `[REF: NanoClaw poll-loop.ts L145-L148]`
- [x] Corruption detection & auto-recovery
  `[REF: NanoClaw poll-loop.ts L43-L49 — isCorruptionError()]`
- [x] Idle timeout & retry logic
- [x] Activity tracking (liveness signals during long tool runs)

### 5.5 System Prompt Composition
- [x] `destinations.ts` — agent identity + destination map → system prompt addendum
  `[REF: NanoClaw/container/agent-runner/src/destinations.ts — buildSystemPromptAddendum()]`
- [x] Compose CLAUDE.md equivalent từ nhiều fragment (Instructions + Soul + Memory + Skills)
  `[REF: NanoClaw/src/claude-md-compose.ts — compose entry file from fragments]`
- [x] Compact instructions (tối ưu token count)
  `[REF: NanoClaw/container/agent-runner/src/compact-instructions.ts]`

### 5.6 Native Tools (Chạy trên Host OS)
- [x] `Bash` — `child_process.spawn` thực thi lệnh shell
- [x] `FileRead` — đọc file hệ thống qua `fs.readFile`
- [x] `FileWrite` — ghi file qua `fs.writeFile`
- [x] `FileEdit` — tìm & thay thế nội dung file
- [x] `Grep` — tìm kiếm nội dung (ripgrep-style)
- [x] `Glob` — liệt kê file theo glob pattern
- [x] `http_request` — HTTP client với Vault placeholder `{{vault:Name.field}}`
- [x] `vault_list` — liệt kê credential (chỉ tên, không giá trị)
- [ ] `connector_call` — gọi Connector/Integration đã đăng ký

### 5.7 MCP Tools (Kế thừa NanoClaw)
- [x] MCP Server built-in (`nanoclaw` server)
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/server.ts]`
- [x] Core tools: `send_message`, `send_file`, `edit_message`, `add_reaction`
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/core.ts]`
- [x] Interactive tools: `ask_user_question` (chờ phản hồi từ user)
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/interactive.ts]`
- [x] Scheduling tools: `schedule_message`, `list_scheduled`, `cancel_scheduled`
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/scheduling.ts]`
- [x] Self-mod tools: self-improvement memory mutations
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/self-mod.ts]`
- [x] Agent management tools: `list_agents`, `switch_agent`
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/agents.ts]`
- [x] Khai báo MCP servers bên ngoài qua `container.json`
  `[REF: NanoClaw/container/agent-runner/src/index.ts L77-L88 — mcpServers config]`

### 5.8 SQLite IPC Layer
- [x] Two-DB architecture: `inbound.db` (read-only) + `outbound.db` (write)
  `[REF: NanoClaw/container/agent-runner/src/db/connection.ts — Two-DB connection layer]`
- [x] `messages_in` table: id, seq, kind, timestamp, status, process_after, recurrence, trigger, platform_id, channel_type, thread_id, content
  `[REF: NanoClaw/container/agent-runner/src/db/messages-in.ts — MessageInRow]`
- [x] `messages_out` table: id, seq, in_reply_to, timestamp, deliver_after, recurrence, kind, platform_id, channel_type, thread_id, content
  `[REF: NanoClaw/container/agent-runner/src/db/messages-out.ts — MessageOutRow]`
- [x] `processing_ack` table (status tracking without writing to inbound.db)
- [x] `session_state` table (key-value: continuation, settings)
  `[REF: NanoClaw/container/agent-runner/src/db/session-state.ts]`
- [x] `session_routing` table (current channel/platform/thread binding)
  `[REF: NanoClaw/container/agent-runner/src/db/session-routing.ts]`
- [x] Seq numbering: odd for container, even for host (tránh collision)
  `[REF: NanoClaw messages-out.ts L42-L54 — disjoint namespace]`
- [x] Journal mode DELETE (không dùng WAL vì cross-mount visibility)
  `[REF: NanoClaw connection.ts L12-L18 — VirtioFS mmap coherency issue]`
- [x] Liveness heartbeat file (`.heartbeat`)

### 5.9 Memory Scaffold
- [x] `memory-scaffold.ts` — tạo thư mục `memory/` per-agent khi boot
  `[REF: NanoClaw/container/agent-runner/src/memory-scaffold.ts]`
- [x] Memory templates (summaries, preferences, learnings)
  `[REF: NanoClaw/container/agent-runner/src/memory-templates/]`
- [ ] Provider opt-in: `usesMemoryScaffold` flag
  `[REF: NanoClaw providers/types.ts L14-L15]`
- [ ] Hermes-style self-improving memory
  `[REF: Hermes/data/memories/ — bộ nhớ lưu dưới dạng file text/JSON]`

---

## 6. Tauri Desktop Shell (Rust Backend)

### 6.1 Quản lý Engine Process
- [x] `spawn_engine()` trong `runtime.rs` — spawn Bun/Node process
- [x] Inject biến môi trường (`CONTAINER_RUNTIME_BIN=process`, `VUA_DATA_DIR`, `VUA_IPC_DIR`)
- [x] Truyền AppHandle từ Tauri context khi spawn
- [x] Health check: kiểm tra Agent Runner còn sống, auto-restart nếu crash
  `[REF: NanoClaw/src/host-sweep.ts — host-sweep loop, restart crashed containers]`
- [x] Graceful shutdown: gửi signal dừng Agent Runner khi thoát app

### 6.2 Host-side Session Management
- [ ] Session manager: tạo/quản lý IPC databases per-agent
  `[REF: NanoClaw/src/session-manager.ts — 18886 bytes, quản lý session SQLite]`
- [ ] Container runner: spawn + monitor agent process lifecycle
  `[REF: NanoClaw/src/container-runner.ts — 22922 bytes, spawn + logging + restart]`
- [ ] Container config: generate `container.json` cho mỗi agent group
  `[REF: NanoClaw/src/container-config.ts]`
- [ ] Group folder management: thư mục làm việc per-agent
  `[REF: NanoClaw/src/group-folder.ts]`
- [ ] Group persona: instructions + soul file per-agent
  `[REF: NanoClaw/src/group-persona.ts]`

### 6.3 Message Delivery (Host → Container → Channels)
- [ ] Delivery system: đọc `outbound.db`, gửi message đến đúng channel
  `[REF: NanoClaw/src/delivery.ts — 16550 bytes, dispatch to channels]`
- [ ] Router: nhận message từ channels, ghi vào `inbound.db`
  `[REF: NanoClaw/src/router.ts — 20666 bytes, message routing]`
- [ ] Response registry: theo dõi message đã gửi / chưa gửi
  `[REF: NanoClaw/src/response-registry.ts]`

### 6.4 WASM Sandbox (Tùy chọn)
- [x] Wasmtime sandbox cho code execution an toàn
- [x] Feature flag `--features sandbox` (off mặc định)

---

## 7. Vault — Kho bảo mật Cốt lõi

> **Vault là tính năng chính của V-Assistant, KHÔNG lấy từ OS Keychain**

- [x] CRUD credential cơ bản (hoàn toàn dùng local SQLite `vault.db`)
- [x] Chuyển sang V-Assistant Vault nội bộ (SQLite mã hóa hoặc encrypted file)
- [x] Mã hóa AES-256 / XOR cipher cho credential storage
- [ ] Master password hoặc device-bound key để unlock Vault
- [x] API cho Agent Runner: `vault_set`, `vault_get`, `vault_delete`, `vault_list`
- [x] Placeholder resolution: `{{vault:Name.field}}` → giá trị thật
- [x] Agent chỉ thấy tên field, không bao giờ thấy giá trị secret
- [x] Migration dữ liệu từ OS Keychain sang V-Assistant Vault
- [x] Field động: chọn kiểu dữ liệu (text/password/number/url/email/date/datetime) + icon

---

## 8. Kênh kết nối (Channels)

### 8.1 Kênh mặc định
- [x] CLI Channel — kênh dòng lệnh cục bộ
- [x] Telegram Bot — long-polling 2 chiều trong app

### 8.2 Channel Architecture (Kế thừa NanoClaw)
- [ ] Channel adapter interface chuẩn hóa
  `[REF: NanoClaw/src/channels/ — thư mục chứa channel adapters]`
- [ ] Chat SDK Bridge: cơ chế tự đăng ký adapter
- [ ] Message flow chuẩn: Channel → Router → `inbound.db` → Agent → `outbound.db` → Delivery → Channel
  `[REF: NanoClaw/src/router.ts + delivery.ts]`
- [ ] Webhook server cho channel nhận callback
  `[REF: NanoClaw/src/webhook-server.ts — 5965 bytes]`

### 8.3 Kênh mở rộng
- [ ] Slack adapter
- [ ] Discord adapter
- [ ] WhatsApp adapter
- [ ] Webhook adapter (generic HTTP)

### 8.4 Telegram nâng cao (Kế thừa Claw)
- [ ] Telegram Webhook mode (thay vì long-polling, cho production)
  `[REF: Claw SPEC.md §8 — Webhook Telegram qua Nginx reverse proxy]`
- [ ] Đồng bộ 2 chiều cấu hình Telegram (.env ↔ gateway config)
  `[REF: Claw SPEC.md §7 — sync cấu hình Telegram 2 chiều]`

---

## 9. Integrations & Connectors

- [x] Connector framework cơ bản (connector_call tool)
- [x] Connector đọc Vault → tự áp auth header
- [ ] Connector **GitHub** — thao tác repo, issue, PR
- [ ] Connector **Notion** — đọc/ghi database, page
- [ ] Connector **Slack** — gửi tin nhắn, quản lý channel
- [ ] Connector **Discord** — bot commands
- [ ] Connector **Google Drive** — upload/download/search
- [ ] Connector **Google Calendar** — tạo/đọc/sửa sự kiện
- [ ] Wizard cài đặt connector từng bước trên UI

---

## 10. Agent Skills & MCP

### 10.1 Skills hiện có
- [x] 10 built-in skills
- [x] Skills chuẩn `skills/*/SKILL.md`
- [x] Cài đặt skill từ URL
- [x] Validate skills khi build
- [x] Inject skill instructions vào system prompt

### 10.2 Skills mở rộng
- [ ] Per-role skill sets (mỗi Agent gán bộ skill riêng)
  `[REF: NanoClaw/src/group-skills.ts]`
- [ ] 9router Skills integration
  `[REF: 9router/skills/ — 8 skill modules: chat, web-fetch, web-search, embeddings, stt, tts, image]`
- [ ] Skill marketplace / community store

### 10.3 MCP (Model Context Protocol)
- [ ] MCP Client tích hợp trong Agent Runner
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/server.ts — MCP server implementation]`
- [ ] Khai báo MCP servers qua config file
- [ ] Agent tự discovery & gọi MCP tools
- [ ] MCP built-in: expose native tools qua MCP protocol
- [ ] 9router MCP integration
  `[REF: 9router/src/lib/mcp/ — MCP tools]`

---

## 11. Self-Improving Memory

- [x] Hermes-style: Agent tự suy ngẫm sau cuộc hội thoại
- [x] Trích xuất thông tin quan trọng → lưu vào memory riêng per-Agent
- [x] Memory kế thừa cho các phiên chat sau
- [x] Memory lưu dưới dạng mảng string trong state → cần chuyển sang file markdown per-Agent
  `[REF: Hermes/data/memories/ — lưu bộ nhớ dưới dạng file]`
  `[REF: NanoClaw/container/agent-runner/src/memory-scaffold.ts — memory tree structure]`
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/self-mod.ts — self-modification MCP]`
- [ ] Memory summarization (tóm tắt khi memory quá dài)
- [ ] Memory search (tìm kiếm trong memory cũ)

---

## 12. Scheduled Tasks (Lập lịch)

- [x] Tạo/sửa/xóa scheduled task trên UI
- [x] Trình lập lịch kiểm tra mỗi phút
- [x] Kích hoạt Agent thực thi theo chu kỳ
- [x] Giao kết quả vào chat + Telegram
- [ ] Scheduling qua MCP tools (schedule_message, list_scheduled, cancel_scheduled)
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/scheduling.ts — 10911 bytes]`
- [ ] Process_after & recurrence support từ IPC
  `[REF: NanoClaw messages-in.ts — process_after, recurrence columns]`
- [ ] Lịch sử chạy & logs per-task
- [ ] Retry on failure policy

---

## 13. Bảo mật & Hiệu năng

- [x] API keys chỉ gửi đến vendor, không gửi nơi khác
- [x] Agent chỉ thấy tên credential, không thấy giá trị
- [x] Secret thay tại chỗ bởi executor, không lọt vào model
- [ ] Vault mã hóa AES-256 nội bộ
- [ ] Rate limiting cho tool execution
- [ ] Resource limits cho Bash tool (timeout, max output size)
- [ ] File system sandboxing (giới hạn thư mục Agent truy cập)
- [ ] Audit log: ghi lại mọi tool call & API request
- [ ] Egress lockdown (hạn chế outbound network calls)
  `[REF: NanoClaw/src/egress-lockdown.ts]`
- [ ] Command gate (chặn dangerous commands)
  `[REF: NanoClaw/src/command-gate.ts]`
- [ ] Circuit breaker (ngắt khi provider lỗi liên tục)
  `[REF: NanoClaw/src/circuit-breaker.ts]`
- [ ] Inbox safety (validate inbound messages)
  `[REF: NanoClaw/src/inbox-safety.ts]`
- [ ] Attachment safety (validate file uploads)
  `[REF: NanoClaw/src/attachment-safety.ts]`

---

### Audit remediation (2026-07-14)

- [ ] Replace the XOR vault cipher with AES-256-GCM and a per-device key or
      user-provided master password; migrate existing `vault.db` entries.
- [ ] Bind every Vault credential and connector token to an allowlisted origin
      before resolving placeholders or attaching authorization headers.
- [ ] Add a command gate, per-agent filesystem allowlist, egress policy, and
      audit trail before enabling host tools for general users.
- [ ] Bundle the Agent Runner in Tauri resources; production must not depend on
      the checkout, `npx`, or a developer-installed Node runtime.
- [ ] Move Telegram, scheduled jobs, and RAG execution behind the host/Runner
      IPC path; keep the webview engine as a fallback only.
- [x] Add bounded retry with exponential backoff and `Retry-After` support for
      transient 429/529 responses from Claude, ChatGPT, and Gemini in both
      webview and Runner.
- [x] On exhausted 429/529 retries, fail over this request to another configured
      vendor; OpenRouter is always the final fallback. Keep the user's selected
      provider unchanged and never switch after text has started streaming.
      Request-ID diagnostics remain a follow-up.

---

## 14. Testing & CI/CD

### 14.1 Test hiện có
- [x] `scripts/tool-loop-check.mjs` — Agent tool calling
- [x] `scripts/telegram-check.mjs` — Telegram 2 chiều
- [x] `scripts/schedule-check.mjs` — Scheduled tasks
- [x] `scripts/login-check.mjs` — Luồng đăng nhập
      + Claude, ChatGPT, Gemini 429 retry regressions
- [x] `scripts/isolation-check.mjs` — Cô lập vai trò
- [x] `scripts/self-improve-check.mjs` — Self-improving memory
- [x] `scripts/connector-check.mjs` — Connectors
- [x] `scripts/rag-check.mjs` — Knowledge RAG
- [x] `npm run check` — CI pipeline chạy toàn bộ test

### 14.2 Test cần thêm
- [ ] Test Universal LLM Client (mock server mỗi provider)
  `[REF: NanoClaw/container/agent-runner/src/providers/mock.ts — mock provider]`
- [x] Test Agent Loop Executor (end-to-end) — `agent-runner/scripts/e2e-check.mjs`
      (inbound.db → poll loop → mock provider → outbound.db, chạy trong CI)
- [x] Test Poll Loop — phủ bởi `e2e-check.mjs` (poll → format → query → write)
- [x] Test SQLite IPC — phủ bởi `e2e-check.mjs` (Two-DB inbound/outbound)
- [x] Test Native Tools (Bash, FileRead, FileWrite, FileEdit, Grep, Glob) —
      `agent-runner/scripts/native-tools-check.mjs`
- [x] Test provider transient retries —
      `agent-runner/scripts/anthropic-retry-check.mjs` +
      `agent-runner/scripts/openai-gemini-retry-check.mjs`
- [ ] Test MCP Tools
  `[REF: NanoClaw/container/agent-runner/src/mcp-tools/core.test.ts]`
- [ ] Test Vault encryption/decryption
- [ ] Test Formatter
  `[REF: NanoClaw/container/agent-runner/src/formatter.test.ts — 7670 bytes]`

### 14.3 CI/CD & Đóng gói
- [x] GitHub Actions workflow (build installer)
- [x] Bản phát hành v0.1.0
- [x] Docker live-dev (`docker-compose.dev.yml` + `dev.sh`)
- [ ] Bundle Agent Runner (Bun binary hoặc Node) vào Tauri resources
- [ ] Auto-detect runtime: Bun có sẵn → dùng Bun; fallback Node
- [ ] Code signing & notarize macOS
- [ ] Auto-update mechanism (Tauri updater plugin)

---

## Tổng kết Số liệu

| Phân loại | ✅ Xong | 🔄 Update | ⬜ Chưa làm |
|-----------|:---:|:---:|:---:|
| Tài liệu | 9 | 0 | 2 |
| Giao diện UI | 26 | 2 | 7 |
| Authentication | 4 | 0 | 3 |
| AI Providers & 9router | 6 | 0 | 5 |
| **Agent Runner (Core)** | **0** | **0** | **42** |
| Tauri Shell (Host-side) | 2 | 3 | 7 |
| Vault | 1 | 1 | 8 |
| Channels | 2 | 0 | 8 |
| Integrations | 2 | 0 | 7 |
| Skills & MCP | 5 | 0 | 8 |
| Memory | 3 | 1 | 2 |
| Scheduled | 4 | 0 | 4 |
| Bảo mật | 3 | 0 | 10 |
| Testing & CI/CD | 9 | 0 | 12 |
| **TỔNG** | **76** | **7** | **125** |

> **76 tính năng đã hoàn thành**, **7 cần cập nhật**, **125 chưa triển khai**.
>
> **Trọng tâm #1: Agent Runner (42 items)** — kế thừa NanoClaw poll-loop, provider registry, MCP tools, SQLite IPC, memory scaffold.
> **Trọng tâm #2: Bảo mật (10 items)** — kế thừa NanoClaw circuit-breaker, command-gate, egress-lockdown.
> **Trọng tâm #3: Tauri Host-side (7 items)** — kế thừa NanoClaw session-manager, container-runner, delivery.
