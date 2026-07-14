# V-Assistant — Báo cáo Audit theo Thiết kế (idea.md / SPEC.md / ARCH.md)

> **Ngày audit:** 2026-07-14
> **Chuẩn đối chiếu:** [idea.md](./idea.md) · [SPEC.md](./SPEC.md) · [ARCH.md](./ARCH.md) (+ CHECKLIST.md làm tham chiếu trạng thái)
> **Phạm vi code:** toàn bộ repo tại commit `7e8c32d` + thay đổi chưa commit trên nhánh `claude/v-assistant-desktop-abs2gw`
> **Phương pháp:** đọc 3 tài liệu thiết kế → đối chiếu từng điều khoản với code thực tế → phân loại: ✅ đúng thiết kế · ⚠️ lệch thiết kế · 🔀 làm ở sai tầng · ⬜ chưa làm

> **⚠️ Đính chính 2026-07-14 (sau khi PO chốt khôi phục subscription login):**
> - Điểm em chấm ✅ cho onboarding ở §1.2 §1 là **SAI**: việc lùi ChatGPT/Claude/Gemini về "dán API key" đã **phản thiết kế** (idea.md §A, SPEC §1 yêu cầu đăng nhập bằng subscription, API key chỉ ở Advanced Options). Đã sửa: Claude/Gemini quay lại OAuth subscription 1-click, ô key rút xuống Advanced.
> - **SEC-03** đổi trạng thái: từ "gỡ 3 client mượn" → **quyết định sản phẩm của PO là giữ OAuth vendor bằng client CLI chính chủ (Claude Code / Gemini CLI)**. Rủi ro ToS vẫn còn (ghi chú `ponytail:` trong `oauth.ts`); hướng nâng cấp bền vững = chuyển OAuth về 9router server-side (CHECKLIST §4.2). ChatGPT vẫn dán key vì OpenAI không phát hành client OAuth công khai.
> - Token subscription vendor giờ được dùng **native + Bearer + header beta** (không nhét qua `x-api-key` như lỗi cũ) — sửa tại `providers.ts` (`loginConfig`, `SUBSCRIPTION_MODELS`, `streamAnthropic`/`streamGemini` nhận cờ `oauth`). Header đúng theo chuẩn OAuth vendor nhưng **chưa smoke-test bằng token thật** (CI không có credential) — xem ghi chú `ponytail:`.

---

## 0. Tóm tắt điều hành

**Kết luận chính:** Code không "thiếu tính năng" so với thiết kế — phần lớn tính năng đều đã có. Vấn đề là **nhiều tính năng được xây ở SAI TẦNG kiến trúc**: ARCH §4.6 định nghĩa engine nhúng webview là *fallback*, nhưng thực tế fallback đã trở thành đường chính và đang tiếp tục được mở rộng (RAG, Telegram, Scheduler, Self-improve đều nằm trong webview), trong khi Universal Agent Runner — trung tâm của cả 3 tài liệu thiết kế — đã chạy được nhưng chưa được UI dùng làm đường chính.

| Trục đánh giá | Kết quả |
|---|---|
| Độ phủ tính năng so với idea/SPEC | 🟢 ~80% các mục đã có hiện thực ở đâu đó |
| Độ đúng tầng so với ARCH | 🔴 5 hệ con nằm sai tầng (webview thay vì runner/host) |
| Cam kết bảo mật trong SPEC §5 (Vault AES-256) | 🔴 Chưa đạt — XOR cipher, không phải AES-256 |
| Cam kết "Direct Native API" (SPEC §3) | ⚠️ Lệch — vendor login thực tế đi qua OpenRouter |
| Đóng gói theo SPEC §4 (runner trong Resources) | ⬜ Chưa làm — spawn `npx tsx` từ thư mục dev |

**3 việc phải làm ngay (trước mọi commit):** xem mục 5 — SEC-01 (key thật ngoài gitignore), SEC-02 (Google client_secret trong source), SEC-03 (OAuth client mượn của app khác — đồng thời là lệch SPEC §1).

---

## 1. Ma trận tuân thủ thiết kế

### 1.1 idea.md — Bản đồ tính năng A–F

| Mục | Yêu cầu thiết kế | Trạng thái | Ghi chú |
|---|---|---|---|
| A. Login OAuth-first, mở lại vào thẳng màn hình chính | ✅ | Onboarding + local user + skip Welcome hoạt động đúng |
| A. Advanced Options chỉ hiện sau khi login | ✅ | Settings đúng thiết kế |
| A. Tauri tự spawn runner làm Host Process khi mở app | ⚠️ | `runtime.rs` spawn được nhưng bằng `npx tsx` từ thư mục project — chỉ chạy trên máy dev (xem DEV-05) |
| B. Universal Agent Loop thay Claude SDK | ✅ | `poll-loop.ts` + 3 adapter, không dùng SDK, e2e pass |
| B. `Bash` qua `child_process.spawn` | ⚠️ | Code dùng `execSync` — **lệch chữ spawn trong cả idea.md B lẫn SPEC §4.2**, chặn event loop, đứng heartbeat (DEV-06) |
| B. Native tools FileRead/Write/Edit, Grep, Glob | ⚠️ | Đủ 6 tool nhưng `grep`/`glob` nối chuỗi shell không escape (SEC-05) |
| B. Self-improving memory trong Agent (runner) | 🔀 | Đã có nhưng nằm ở webview (`selfImprove.ts`), lưu string array trong React state — ARCH §2.3 và SPEC §8 yêu cầu **file .md per-agent phía runner**. Runner có memory-scaffold nhưng chưa ai ghi vào |
| C. Channels qua Chat SDK Bridge + SQLite IPC | 🔀 | Telegram chạy 2 chiều thật nhưng `telegram.ts:189` gọi thẳng `runAssistant()` (webview) — **không đi qua `inbound.db`/`outbound.db`** như thiết kế. Chat SDK Bridge chưa có |
| D. Role isolation (instructions + soul + memory riêng) | ✅ | Store cô lập đúng, có test `isolation-check.mjs` |
| D. Cấu hình Agent bằng markdown (Paperclip-style) | ⚠️ | Import từ URL đã có (`agentImport.ts`); export chưa có; format chưa round-trip |
| D. Knowledge RAG cục bộ TF-IDF per-role | 🔀 | Hoạt động tốt nhưng nằm trong webview (IndexedDB) — runner không truy cập được ⇒ agent chạy qua runner/Telegram/schedule **không có RAG** |
| E. Skills chuẩn `SKILL.md`, inject vào prompt | ✅ | 10 skill + install từ URL + validate khi build |
| E. MCP servers khai báo qua `container.json` | ⚠️ | `mcp-client/` đã có trong runner (248 dòng) nhưng CHECKLIST §10.3 tự ghi là chưa tích hợp — cần e2e xác nhận rồi cập nhật tài liệu |
| F. Vault mã hóa, quản lý bởi V-Assistant | ⚠️ | Đúng hướng (SQLite nội bộ, không OS Keychain) nhưng **XOR ≠ mã hóa** (SEC-04) |
| F. Connectors đọc Vault, model không thấy secret | ⚠️ | Cơ chế placeholder đúng thiết kế, nhưng thiếu ràng buộc host ⇒ có đường exfiltrate token (SEC-06) |
| F. `http_request` + `{{vault:Name.field}}` | ✅ | Đúng thiết kế ở cả 2 tầng (webview + runner) |

### 1.2 SPEC.md — Đặc tả kỹ thuật §1–§8

| § | Đặc tả | Trạng thái | Ghi chú |
|---|---|---|---|
| §1 | Onboarding OAuth-first, loopback qua trình duyệt hệ thống | ✅ | `auth.rs` loopback + PKCE đúng chuẩn RFC 8252 (thiếu `state`, mức nhẹ — SEC-09) |
| §1 | "Duy nhất nút Đăng nhập OAuth (Subscription)" | ⚠️ | Code thêm OAuth trực tiếp ChatGPT/Claude/Gemini bằng **client ID mượn của Codex CLI / Claude Code / Gemini CLI** — ngoài phạm vi spec, rủi ro ToS, và không hoạt động đúng (SEC-03). Spec chỉ yêu cầu 1 nút subscription + Advanced Options dán key |
| §2 | Agent config markdown, Memory tự phản tư per-agent | ⚠️ | Xem idea.md D — memory chưa là file .md |
| §3 | **Direct Native API** từng vendor | ⚠️ | Webview có đủ 3 giao thức native, nhưng luồng đăng nhập vendor thực tế map sang model OpenRouter (`ROUTED_MODELS`) — chạy qua router, không phải native API. Spec và hiện thực kể 2 câu chuyện khác nhau |
| §3 | Mọi adapter hỗ trợ streaming + tool calling | ⚠️ | Runner: đủ cả 3 adapter ✅. Webview: chỉ đường OpenAI-compat có tools; `streamAnthropic`/`streamGemini` không có (DEV-03) |
| §4.1 | Runner nhúng trong **Resources**, spawn bằng Bun/Node | ⬜ | Chưa đóng gói — spawn từ `agent-runner/src` bằng `npx tsx`, dò PATH/NVM máy dev (DEV-05). Đây là mục spec quan trọng nhất chưa làm |
| §4.2 | Bash qua `child_process.spawn` | ⚠️ | Dùng `execSync` (DEV-06) |
| §4.3 | Health check + auto-restart + graceful shutdown | ✅ | `runtime.rs` có đủ |
| §4.4 | Engine nhúng là **fallback** khi runner chưa chạy / demo | 🔀 | **Đảo ngược trên thực tế**: fallback đang là đường chính, còn nhận thêm tính năng mới. Xem mục 2 |
| §5 | Vault **AES-256**, tại `vault.db` | 🔴 | XOR + key hardcode, key nhân bản ở 2 ngôn ngữ (SEC-04). Vault là "tính năng cốt lõi" theo spec nên đây là khoảng cách lời hứa–thực tế lớn nhất |
| §5 | Connectors auth tự động, model chỉ thấy placeholder | ⚠️ | Đúng cơ chế, thiếu allowlist host (SEC-06) |
| §6 | Channels: mọi kênh → `inbound.db` → runner → `outbound.db` → kênh | 🔀 | Telegram/CLI chưa đi qua IPC (xem idea.md C) |
| §6 | Scheduled tasks kiểm tra mỗi phút, giao kết quả chat + Telegram | 🔀 | Đúng hành vi nhưng `scheduler.ts` sống trong webview ⇒ **chỉ chạy khi app mở** — mâu thuẫn với kiến trúc "Silent Host Process" của chính §4 và ví dụ nghiệp vụ idea.md §1.3 (agent tự chạy chiến dịch, theo dõi, báo cáo) |
| §7 | Skills per-role + MCP client trong runner | ⚠️ | Per-role skills có trong UI; skill đến runner đang được "đi nhờ" qua field `platform_id` (JSON nhét trong cột routing — `poll-loop.ts:147`) thay vì system prompt composition như CHECKLIST §5.5 mô tả |
| §8 | Self-improving memory Hermes-style, file md per-agent | 🔀 | Có ở webview, sai tầng + sai định dạng lưu |

### 1.3 ARCH.md — 6 Quyết định kiến trúc (§4)

| # | Quyết định | Trạng thái |
|---|---|---|
| 1 | Bỏ Docker cho end-user | ✅ Đúng — runner là host process, Docker chỉ còn cho dev |
| 2 | Đa vai trò, không đa tiến trình | ✅ Đúng ở UI; ⚠️ runner hiện boot 1 agent/lần (`config.agentName`), chưa có cơ chế chuyển role không restart — cần làm rõ khi runner thành đường chính |
| 3 | Universal Agent Loop thay Claude SDK | ✅ Đúng |
| 4 | Vault nội bộ AES-256, không OS Keychain | 🔴 Nội bộ: đúng; AES-256: chưa (SEC-04) |
| 5 | Sandbox WASM tùy chọn, off mặc định | ✅ Đúng (`sandbox.rs` + feature flag) |
| 6 | Engine nhúng là fallback | 🔀 Bị đảo ngược trên thực tế — xem mục 2 |

**Lưu ý ARCH §3 (cấu trúc thư mục):** tài liệu ghi `universal-llm-client.ts`, `universal-executor.ts` nhưng code thực tế là `providers/` + `poll-loop.ts` — doc drift, nên cập nhật ARCH cho khớp (code đang đúng hơn tài liệu).

---

## 2. Phát hiện kiến trúc số 1: Fallback trở thành đường chính

Cả 3 tài liệu cùng vẽ một kiến trúc: **UI mỏng → SQLite IPC → Universal Agent Runner (bộ não) → LLM + tools**. Engine nhúng webview chỉ là fallback (ARCH §4.6, SPEC §4.4).

Hiện thực đang ngược lại:

```text
Thiết kế:   UI ──IPC──> RUNNER (RAG, memory, tools, channels, schedule)
Thực tế:    UI ──────> ENGINE WEBVIEW (RAG, memory, tools, Telegram, scheduler)
                        └─(nanoclaw.ts, chỉ khi runner sống)──> RUNNER (chưa có RAG/memory ghi/channels)
```

Năm hệ con thiết kế đặt ở runner/host nhưng đang sống trong webview:

1. **Knowledge RAG** (`src/runtime/knowledge.ts`, IndexedDB) — runner không đọc được.
2. **Self-improving memory** (`src/runtime/selfImprove.ts`, React state) — runner có scaffold `memory/` nhưng không ai ghi.
3. **Telegram channel** (`src/runtime/telegram.ts` → `runAssistant()` trực tiếp).
4. **Scheduler** (`src/runtime/scheduler.ts` → `runAssistant()` trực tiếp).
5. **Tool loop + connectors** (`providers.ts` / `tools.ts` / `connectors.ts`).

Hệ quả người dùng cảm nhận được: tắt app là mất Telegram + lịch chạy; agent qua runner trả lời không có tri thức tài liệu; hai đường chat cho kết quả khác nhau tuỳ engine nào đang chạy.

**Khuyến nghị:** phần còn thiếu để đảo lại đúng thiết kế chính là CHECKLIST §6.2–6.3 (session manager, delivery, router phía host). Ưu tiên làm phần này, **đóng băng tính năng mới trên engine webview**, rồi di trú dần 5 hệ con theo thứ tự: channels → scheduler → memory → RAG.

---

## 3. Điểm thừa so với thiết kế

| # | Nội dung | Đề xuất |
|---|---|---|
| EX-01 | **OAuth trực tiếp vendor bằng client mượn** (`oauth.ts`) — không có trong SPEC §1, vốn chỉ yêu cầu 1 nút OAuth subscription + Advanced Options dán key | Xóa; giữ OpenRouter PKCE + dán key. Nếu tương lai có client OAuth chính chủ thì thêm lại theo đúng quy trình spec |
| EX-02 | **Hai bộ provider stack** (~600 dòng vai trò trùng giữa `src/runtime/providers.ts` và `agent-runner/src/providers/`) — hệ quả của mục 2 | Giảm dần theo lộ trình di trú; không sửa song song 2 nơi nữa |
| EX-03 | URL builder OAuth lặp 2 lần trong `oauth.ts` (desktop + web, ~60 dòng) | Gộp 1 hàm `buildAuthorizeUrl()` — tự biến mất nếu làm EX-01 |
| EX-04 | XOR key nhân bản ở 2 ngôn ngữ (`vault.rs:69` + `vault-resolver.ts:15`) | Hợp nhất khi sửa SEC-04: key do Tauri cấp cho runner qua env lúc spawn |
| EX-05 | Middleware dev trong `vite.config.ts` phình thành mini-backend 120 dòng với các safety-check chống race đồng bộ 2 chiều | Chấp nhận dev-only, không mở rộng thêm; đảm bảo không lọt vào build production |

## 4. Điểm thiếu so với thiết kế

| # | Thiết kế yêu cầu | Hiện trạng | Mức |
|---|---|---|---|
| GAP-01 | SPEC §4.1: runner nhúng trong Tauri **Resources**, auto-detect Bun/Node | Spawn `npx tsx` từ thư mục dev, dò PATH/homebrew/NVM máy dev (`runtime.rs:49-110`) | 🔴 Chặn release |
| GAP-02 | SPEC §5: Vault **AES-256** | XOR cipher (SEC-04) | 🔴 Chặn release |
| GAP-03 | ARCH §2.7: channel adapters qua IPC + Chat SDK Bridge | Telegram trong webview; bridge chưa có | 🟠 |
| GAP-04 | SPEC §8: memory là **file .md per-agent**, kế thừa qua phiên | String array trong React state; scaffold runner bỏ trống | 🟠 |
| GAP-05 | ARCH §2.3 bước 2: runner nạp Knowledge RAG vào ngữ cảnh | RAG chỉ có ở webview | 🟠 |
| GAP-06 | Token hết hạn (Google access token ~1h) — spec ngầm định login bền vững ("mở lại vào thẳng màn hình chính") | Không có refresh; hết hạn là gãy | 🟠 |
| GAP-07 | idea.md D: export Agent ra markdown (round-trip Paperclip-style) | Chỉ có import | 🟡 |
| GAP-08 | CHECKLIST §13 (bảo mật vận hành): command gate, giới hạn thư mục, audit log, circuit breaker | Chưa có — `bash`/`file_write` toàn quyền host | 🔴 Chặn ship cho người dùng phổ thông |
| GAP-09 | Code signing/notarize + auto-update (SPEC §1 "tải .dmg/.exe/.deb") | Chưa có | 🟡 Trước phân phối |

## 5. Bảo mật (đối chiếu cam kết SPEC §5 + idea.md F)

> SPEC §5 cam kết: *"Tự động mã hóa AES-256… Model AI chỉ nhìn thấy tên trường credential… không bao giờ tiếp cận được khóa bảo mật gốc."* Các phát hiện dưới đây đo code theo đúng cam kết đó.

| ID | Mức | Phát hiện | Vi phạm điều khoản | Khắc phục |
|---|---|---|---|---|
| SEC-01 | 🔴 Critical | `.vua_vault_dev.json` chứa 2 key OpenRouter thật + `.vua_state_dev.json` chứa lịch sử chat, **không có trong `.gitignore`** | SPEC §5 (secret không được lộ) | Thêm gitignore ngay; **revoke 2 key**; kiểm tra trước mọi `git add .` |
| SEC-02 | 🔴 Critical | Google `client_secret` hardcode tại `oauth.ts:90` (chưa commit — còn kịp gỡ) | SPEC §5 | Gỡ khỏi source; secret không bao giờ nằm trong app desktop |
| SEC-03 | 🔴 Critical | OAuth client ID mượn: Codex CLI (`app_EMoam…`), Claude Code (`9d1c250a…`), Gemini CLI. Rủi ro khóa tài khoản user + về kỹ thuật token thu được không dùng được đúng cách (token Claude bị gửi qua `x-api-key` tại `providers.ts:302`; token ChatGPT là id_token) | SPEC §1 (ngoài phạm vi luồng đăng nhập đặc tả) | Xóa 3 client; chốt OpenRouter PKCE (hợp lệ) + dán key vendor như SPEC Advanced Options |
| SEC-04 | 🔴 High | Vault dùng XOR + key hardcode `v-assistant-secure-vault-salt-key-360org`, nhân bản tại `vault.rs:69` và `vault-resolver.ts:15` — ai đọc binary/source là giải được toàn bộ `vault.db` | SPEC §5 / ARCH §4.4 (**AES-256**) | AES-256-GCM, key ngẫu nhiên per-device trong OS keychain*, truyền cho runner qua env lúc spawn. (*giữ **data** trong SQLite nội bộ đúng tinh thần "không phụ thuộc OS Keychain"; keychain chỉ giữ key mở — nếu PO muốn tuyệt đối không đụng keychain thì dùng master password theo CHECKLIST §7) |
| SEC-05 | 🟠 High | Tool `grep`/`glob` của runner nối chuỗi shell không escape (`native-tools/index.ts:188,224`) — shell injection qua pattern + lỗi đúng đắn với pattern có khoảng trắng | ARCH §2.3 (tool an toàn) | `execFileSync('grep', args)` dạng mảng; glob dùng `fs.globSync`/`fast-glob` |
| SEC-06 | 🟠 High | `connector_call` gắn `Authorization: Bearer <token>` vào **mọi full URL** (`connectors.ts` `absolute()`); vault placeholder resolve vào request tới mọi domain ⇒ prompt injection từ tài liệu Knowledge/tin Telegram có thể exfiltrate token | SPEC §5 ("không bao giờ tiếp cận khóa gốc" — placeholder đúng, nhưng đường gián tiếp vẫn mở) | Bind credential↔host: connector chỉ gắn auth trong base domain; placeholder chỉ resolve khi host khớp entry |
| SEC-07 | 🟠 High | `bash`/`file_write`/`file_edit` toàn quyền host, không command gate/giới hạn thư mục — SPEC §4.2 chủ đích cho toàn quyền, nhưng sản phẩm nhắm người dùng phổ thông nên cần lớp rào theo CHECKLIST §13 | CHECKLIST §13 | Group folder per-agent + command gate (kế thừa NanoClaw có sẵn) |
| SEC-08 | 🟡 Medium | Dev mode ghi vault plaintext ra `.vua_vault_dev.json` (vite middleware) + localStorage fallback | Dev-only, chấp nhận kèm SEC-01 | Không để cơ chế này vào build production |
| SEC-09 | 🟡 Low | Loopback OAuth thiếu `state` param (`auth.rs`) — PKCE đã chặn kịch bản chính | RFC 8252 (SPEC §1 tham chiếu luồng chuẩn) | Thêm `state` khi tiện |

## 6. Chất lượng code (ngoài phạm vi đối chiếu thiết kế)

Điểm cộng giữ nguyên đánh giá lượt trước: comment "why" tốt, module nhỏ, `auth.rs`/`poll-loop.ts` viết sạch, 10+ smoke test + e2e runner chạy trong CI.

| ID | Vị trí | Vấn đề | Hướng sửa |
|---|---|---|---|
| DEV-01 | `store.tsx:307` | Đọc state bằng `setState(cur => {s = cur; return cur})` giữa async flow — anti-pattern, `s` có thể undefined → crash `s!` | Dùng `stateRef` có sẵn dòng 399 |
| DEV-02 | `store.tsx` (938 dòng) | God file: state + Telegram + scheduler + OAuth + knowledge | Tự gọn lại khi di trú theo mục 2 |
| DEV-03 | `providers.ts` | Webview: tools chỉ có ở đường OpenAI-compat — lệch SPEC §3 | Tự khỏi khi runner thành đường chính |
| DEV-04 | `poll-loop.ts:147` | Skill instructions nhét JSON vào `platform_id` (cột routing) — hack tạm, lệch CHECKLIST §5.5 (system prompt composition) | Chuyển sang compose system prompt khi làm GAP-03 |
| DEV-05 | `runtime.rs:49-110` | `find_executable` dò PATH/homebrew/NVM máy dev; spawn `npx tsx` | Giải quyết trong GAP-01 (bundle Resources) |
| DEV-06 | `native-tools/index.ts` | `execSync` chặn event loop → heartbeat đứng khi tool chạy dài → host tưởng runner chết, restart giữa chừng. Cả idea.md B lẫn SPEC §4.2 đều ghi rõ `child_process.spawn` | Chuyển async spawn đúng spec |
| DEV-07 | `poll-loop.ts:334` | Vòng tool thứ 2+ gửi `currentPrompt = ''` — một số provider từ chối user message rỗng | Thêm test tool-loop ≥2 vòng cho cả 3 adapter |

## 7. Mâu thuẫn nội bộ tài liệu (cần đồng bộ)

1. **README ↔ SPEC/ARCH về Vault:** README nói OS Keychain; SPEC/ARCH/CHECKLIST nói vault nội bộ không phụ thuộc keychain; code là SQLite+XOR. Sau khi sửa SEC-04, cập nhật cả 3 về một mô tả.
2. **README ↔ SPEC về vendor login:** README "dán key nối thẳng vendor" (khớp SPEC) nhưng code lại làm OAuth mượn client (khớp không tài liệu nào). Xử lý theo EX-01.
3. **CHECKLIST tự mâu thuẫn:** §5 "Agent Runner HOÀN THÀNH" ↔ bảng tổng kết "0/42"; §5.7 MCP [x] ↔ §10.3 MCP [ ]; §2.4 per-role skills [x] ↔ §10.2 [ ].
4. **ARCH §3 cấu trúc thư mục** ghi `universal-llm-client.ts`/`universal-executor.ts` — không tồn tại; thực tế là `providers/` + `poll-loop.ts`. Cập nhật ARCH theo code.
5. **ARCH §4.2 "đa vai trò không đa tiến trình"** chưa nói runner xử lý chuyển role thế nào (hiện boot 1 agent). Cần quyết định thiết kế: 1 runner đa role, hay respawn theo role — rồi ghi vào ARCH trước khi làm GAP-03.

## 8. Lộ trình khuyến nghị

### P0 — Hôm nay, trước mọi commit
- [ ] SEC-01: gitignore + revoke 2 key OpenRouter
- [ ] SEC-02: gỡ `client_secret` khỏi `oauth.ts`
- [ ] SEC-03/EX-01: gỡ 3 OAuth client mượn — quay về đúng SPEC §1 (OpenRouter PKCE + dán key)

### P1 — Tuần này
- [ ] DEV-01: sửa hack `setState`
- [ ] SEC-05 + DEV-06: native tools về `spawn`/`execFile` đúng spec
- [ ] Mục 7: đồng bộ README/ARCH/CHECKLIST — chốt một câu chuyện duy nhất
- [ ] Quyết định thiết kế multi-role cho runner (mục 7.5) — ghi vào ARCH

### P2 — Sprint kế: đảo lại kiến trúc về đúng thiết kế (mục 2)
- [ ] GAP-03: host-side session manager + delivery + router (CHECKLIST §6.2–6.3)
- [ ] Chat UI chạy qua runner làm đường chính; đóng băng tính năng mới trên engine webview
- [ ] Di trú: Telegram → IPC channels; scheduler → host; DEV-04 (skill vào system prompt)
- [ ] SEC-06: allowlist host cho connector/placeholder; SEC-07: command gate + group folder

### P3 — Trước release
- [ ] GAP-02/SEC-04: Vault AES-256-GCM (đúng SPEC §5)
- [ ] GAP-04/GAP-05: memory file .md per-agent + RAG chuyển về runner
- [ ] GAP-01: bundle runner vào Tauri Resources (đúng SPEC §4.1) + GAP-06 token refresh
- [ ] GAP-09: signing, notarize, auto-update

---

*Audit đối chiếu idea/SPEC/ARCH theo yêu cầu PO ngày 2026-07-14. Khi xử lý xong mục nào, tick vào đây và ghi nhận vào CHANGELOGS.md; nếu một quyết định thiết kế thay đổi (VD: multi-role runner), cập nhật ARCH.md trước khi code.*
