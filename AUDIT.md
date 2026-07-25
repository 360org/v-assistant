# V-Assistant — Báo cáo Audit v1.0.80

> **Ngày:** 2026-07-25 · **Nhánh:** `dev` @ `3c0f2ab` (working tree sạch)
> **Chuẩn đối chiếu:** [idea.md](./idea.md) · [SPEC.md](./SPEC.md) · [ARCH.md](./ARCH.md) · [CHECKLIST.md](./CHECKLIST.md)
> **So sánh:** audit trước (2026-07-14, v0.1.0) → nay đã qua **~40 release**

---

## 0. Tóm tắt điều hành

Project đã tiến **rất xa** kể từ audit trước. Ba khuyến nghị nặng nhất lần trước đều đã xử lý:

| Vấn đề audit trước | Trạng thái nay |
|---|---|
| 🔴 Vault chỉ là XOR + key hardcode | ✅ **AES-256-CBC + HMAC** (`vault.rs`) — đúng SPEC §5 |
| 🔴 Key thật ngoài `.gitignore` | ✅ Đã chặn |
| 🔴 OAuth mượn client, token không dùng được | ✅ Chạy thật: Claude/Gemini subscription login OK, model picker OK |
| 🟠 Fallback webview thành đường chính | ✅ **Đã đảo lại**: `aiRouter.ts` — *"Chat never calls a vendor endpoint directly"*, Runner ưu tiên, provider là fallback có kiểm soát |

**Vấn đề trọng tâm hiện tại đã đổi bản chất**: không còn là *thiếu tính năng* hay *sai kiến trúc*, mà là **phình source**. `src/` từ 7.5k → **15.4k dòng** (gấp đôi), 3 file vượt 1.6k dòng. Đây là thứ cần xử lý để "tối ưu & nhẹ hơn".

---

## 1. Đã làm được

### 1.1 Kiến trúc — đã về đúng thiết kế
- **AI Router là đường chính** (`aiRouter.ts`, `127.0.0.1:20128`): đúng CHECKLIST §4.2, thứ audit trước khuyến nghị.
- **Engine selector có fallback thông minh** ([engine.ts:228-252](src/runtime/engine.ts:228)): Runner lỗi *trước khi* emit chữ nào → tự chuyển provider; đã emit rồi → giữ partial + báo lỗi (tránh double-charge request). Đây là xử lý chín.
- **Vault rehydrate ngay trong engine** ([engine.ts:217](src/runtime/engine.ts:217)): tin nhắn gửi ngay sau khi mở app không rơi về preview.
- Bỏ hẳn demo-engine-fallback im lặng → giờ báo lỗi rõ "chưa kết nối".

### 1.2 Bảo mật — đã vá các lỗ nghiêm trọng
- Vault: AES-256-CBC + HMAC, không còn XOR.
- `.gitignore` chặn `.vua_vault_dev.json` / `.vua_state_dev.json`.
- Header `anthropic-dangerous-direct-browser-access` chỉ gửi khi thật sự gọi trực tiếp ([providers.ts:579](src/runtime/providers.ts:579)) — fix 401 CORS org.
- Có `credential-boundary-check.mjs` trong CI.

### 1.3 Đăng nhập subscription — chạy thật
Chuỗi lỗi đã gỡ xong trong phiên này: `redirect_uri` (443/callback) → `state` 32 bytes → popup-close không còn giết flow → CORS header → model id. Kết quả: **Claude subscription login + chat hoạt động**.

### 1.4 Kiểm thử & vận hành
- **22 script test**, `npm run check` chạy 14 bước gồm `desktop-bundle`, `desktop-oauth`, `ai-router-contract`, `multi-account`, `credential-boundary`.
- Docker dev (`./dev ui`/`up`), CI GitHub Actions, auto-update (`updater.ts` + banner).
- Tính năng mới: Sessions, MediaGallery, i18n, MCP/CLI engine, unified data path.

### 1.5 Bundle — nhẹ hơn nhiều người tưởng
- `pdfjs-dist` **lazy-load** đúng cách ([knowledge.ts:151](src/runtime/knowledge.ts:151)), worker tách riêng.
- **20 dynamic import** — Tauri API, nanoclaw, pdfjs đều tách khỏi bundle chính.
- `framer-motion` chỉ dùng ở 2 file. Dependencies gọn: 8 runtime deps, agent-runner chỉ 1 (`better-sqlite3`).

> **Kết luận:** bundle runtime **không phải** vấn đề. "Nặng" nằm ở **source code**.

---

## 2. Còn thiếu

| # | Thiếu | Mức | Ghi chú |
|---|---|---|---|
| G-01 | **Tên user Claude sai** (ảnh anh gửi): hiện "Claude" thay vì "Chau Le" | 🟠 | `fetchVendorAccount` fallback `label: "Claude User"` khi bootstrap endpoint không trả email ([oauth.ts:784](src/runtime/oauth.ts:784)). Với token subscription nên gọi `/api/oauth/profile` hoặc parse JWT để lấy tên thật |
| G-02 | **Token refresh** | 🔴 | Token Claude/Gemini hết hạn → gãy, không tự refresh. Exchange đã trả `refresh_token` nhưng chưa lưu/dùng |
| G-03 | Telegram + scheduler vẫn trong webview | 🟠 | Tắt app = mất lịch chạy; trái "Silent Host Process" (SPEC §4) |
| G-04 | RAG vẫn ở webview (IndexedDB) | 🟠 | Agent qua Runner không có tri thức tài liệu |
| G-05 | Memory chưa là file .md per-agent | 🟡 | SPEC §8 |
| G-06 | Rào native tools (command gate, giới hạn thư mục) | 🔴 | CHECKLIST §13 — chặn ship cho user phổ thông |
| G-07 | Export agent ra markdown | 🟡 | idea.md D |
| G-08 | Code signing / notarize macOS | 🟡 | Trước phân phối rộng |

---

## 3. Cần cải tiến — ưu tiên theo tác động

### 3.1 🔴 Ba "god file" chiếm 33% source

| File | Dòng | Audit trước |
|---|---|---|
| `src/pages/Chat.tsx` | **1744** | 299 (×5.8) |
| `src/pages/Settings.tsx` | **1741** | 233 (×7.5) |
| `src/lib/store.tsx` | **1608** | 938 (×1.7) |

`Settings.tsx` chứa ~15 handler không liên quan nhau (backup, data path, AI Router connections, provider catalog, update…). `Chat.tsx` gánh cả composer, model picker, session menu, streaming, self-improve.

**Cách tách (không viết lại, chỉ di chuyển):**
- `Settings.tsx` → tách theo section sẵn có: `settings/AccountSection`, `settings/ProvidersSection`, `settings/DataSection`, `settings/AboutSection`. Mỗi file 150–300 dòng.
- `Chat.tsx` → `chat/ChatHeader` (agent+model+provider picker), `chat/Composer`, `chat/MessageList`. Logic gửi tin giữ ở `Chat.tsx`.
- `store.tsx` → tách hook theo domain: `useProviders`, `useKnowledge`, `useSchedule` — cùng một context, chỉ chia file.

**Lợi ích:** giảm ~40% thời gian đọc khi sửa lỗi, giảm xung đột merge, Fast Refresh hết bị invalidate toàn store (log Vite đang cảnh báo `useApp export is incompatible`).

### 3.2 🟠 Vẫn còn 2 bộ provider stack

`src/runtime/providers.ts` (802 dòng, 9 hàm stream) **và** `agent-runner/src/providers/adapters/*` (3 adapter). Giờ đã có AI Router làm đường chính → phần webview nên co lại còn **một client duy nhất gọi router**, xoá các adapter vendor trực tiếp (giữ lại chỉ `local`).

**Ước tính giảm: ~400–500 dòng** và xoá luôn cả lớp lỗi CORS/header/model-id mà mình vừa mất cả buổi để sửa.

### 3.3 🟠 `oauth.ts` 798 dòng cho 3 provider
Mỗi provider lặp `buildAuthUrl` + `exchangeCode` gần giống nhau. Nếu OAuth chuyển hẳn về 9router server-side (đúng hướng `aiRouter.ts` đang đi), file này rút còn **~150 dòng** (chỉ còn popup + relay). Đây là khoản cắt lớn nhất còn lại.

### 3.4 🟡 i18n mới dùng một nửa
`i18n.ts` chỉ 79 dòng trong khi UI có hàng trăm chuỗi tiếng Anh hardcode ("Signed in with", "not connected"…). Hoặc dùng đủ, hoặc bỏ hẳn — trạng thái nửa vời hiện tại là nợ.

### 3.5 🟡 Model picker vừa thêm chưa được verify
Colima tắt giữa chừng nên **chưa typecheck/chạy test** phần model picker trong `Chat.tsx`. Cần chạy `./dev ui` rồi `npx tsc --noEmit` trong container trước khi tin.

---

## 4. Làm sao nhẹ & tối ưu hơn

### 4.1 Runtime (bundle) — đã tốt, chỉ tinh chỉnh
| Việc | Lợi ích |
|---|---|
| Thay `framer-motion` (~100KB) bằng CSS transition — chỉ dùng ở 2 file cho fade/slide | −100KB gzip |
| Lazy-load các page nặng (`MediaGallery`, `Vault`, `Knowledge`) bằng `React.lazy` | Giảm bundle khởi động ~20–30% |
| Kiểm tra tree-shaking `lucide-react` (import theo tên là đúng, chỉ cần đừng `import * as`) | Nhỏ |

### 4.2 Source (đây mới là chỗ nặng thật)
| Việc | Ước tính giảm |
|---|---|
| Xoá provider stack webview khi router ổn định (§3.2) | −400~500 dòng |
| Rút gọn `oauth.ts` khi OAuth về server-side (§3.3) | −500~600 dòng |
| Tách 3 god file (§3.1) | không giảm dòng nhưng giảm mạnh chi phí bảo trì |
| Gộp `nanoclaw.ts` + `nanoclawSessions.ts` (619 bytes) | −1 file |

**Tổng tiềm năng: giảm ~1.000 dòng (~7% source) và xoá cả một lớp lỗi.**

### 4.3 Hiệu năng runtime
- `store.tsx` ghi **toàn bộ state** vào localStorage + POST `/api/state` mỗi lần state đổi → mỗi ký tự gõ trong chat cũng serialize cả cây state. Nên **debounce 300–500ms** và chỉ ghi phần đã đổi.
- `MODELS` catalog nên lấy từ AI Router (`refreshProviderCatalog` đã có) thay vì hardcode — tránh lặp lại đúng lỗi model id hết hạn.

---

## 5. Lộ trình đề xuất

**P0 — tuần này**
- [ ] Verify model picker (bật `./dev ui`, typecheck + `npm run check`)
- [ ] G-01: sửa tên user Claude (ảnh anh gửi) — lấy tên thật thay "Claude User"
- [ ] G-02: token refresh (đã có `refresh_token`, chỉ cần lưu + dùng)

**P1 — sprint tới**
- [ ] §3.1 tách 3 god file
- [ ] §3.2 co provider stack về một client router
- [ ] §4.3 debounce persist state

**P2 — trước phát hành rộng**
- [ ] G-06 rào native tools · G-03/G-04 di trú scheduler + RAG về Runner
- [ ] §3.3 OAuth về 9router server-side · §4.1 bỏ framer-motion, lazy-load page
- [ ] G-08 code signing

---

*Audit thực hiện bằng cách đọc trực tiếp working tree `dev` @ v1.0.80. Không chạy lệnh nào trên host (Docker đang tắt); các mục cần chạy thử được đánh dấu rõ là chưa verify.*
