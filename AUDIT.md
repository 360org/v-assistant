# 📋 Báo cáo Audit — V-Assistant v1.0.83

> **Ngày:** 2026-07-25 (lượt 3) · **Nhánh:** `dev`
> **Bối cảnh:** PO dùng Antigravity fix theo report lượt 2 → audit lại để xác nhận cái nào xong, cái nào còn.
> **Nguyên tắc:** mọi kết luận đều kiểm chứng bằng `file:line` hoặc chạy thật, không suy đoán.

---

## 🎯 Kết luận 30 giây

| | |
|---|---|
| Antigravity đã fix được | **5/8 mục** trong report lượt 2 — chất lượng tốt, có chỗ vượt đề xuất |
| Em vừa fix thêm | **4 mục**, gồm nguyên nhân gốc của lỗi chat |
| Còn lại | **1 mục lớn** (tách god file) + 1 mục nhỏ (i18n nửa vời) |
| `npm run check` | 🔴 fail → 🟢 **pass (exit 0)** |
| Rust `cargo check` | 🟢 pass |

---

## ✅ PHẦN 1 — Antigravity đã fix (kiểm chứng từng mục)

### ✅ SEC-05 — Shell injection ở `grep`/`glob`
`execSync` chuỗi → **`execFileSync` với mảng tham số** ([native-tools/index.ts:7](agent-runner/src/native-tools/index.ts:7),[:168](agent-runner/src/native-tools/index.ts:168),[:203](agent-runner/src/native-tools/index.ts:203)). Hết đường chèn lệnh, và pattern có khoảng trắng cũng hết hỏng.

### ✅ P0-1 — Native tools không có rào → đã có sandbox
- Tool **`bash` đã bị gỡ hẳn** (grep không còn kết quả)
- Mọi thao tác file đi qua `workspacePath()` → *"Access denied: agent tools are restricted to the assigned workspace"* ([:24](agent-runner/src/native-tools/index.ts:24))
- Agent **không được resolve secret**: *"Credential access denied. Use a connector/gateway reference"* ([:242](agent-runner/src/native-tools/index.ts:242))

### ✅ SEC-06 — Exfiltrate credential qua connector → fix **tốt hơn đề xuất**
Tại [sidecar.mjs:660-698](ai-router/src/sidecar.mjs:660):

| Lớp bảo vệ | Chi tiết |
|---|---|
| Ràng buộc origin | `target.origin !== allowedOrigin` → chặn (đúng thứ em đề xuất) |
| Credential opaque | Header auth **bắt buộc** dùng biến `{{credential:}}`, không nhận giá trị thô |
| Chặn redirect | `redirect: "manual"` — bịt đường lách qua 302 |
| Redact | `redactSecrets()` trên response |
| Allowlist method | Chỉ GET/POST/PUT/PATCH/DELETE |
| Chặn header nguy hiểm | `host`, `cookie`, `content-length` |

### ✅ P0-2 — Claude token refresh
`refreshClaudeToken()` ([providers.ts:801](src/runtime/providers.ts:801)), dùng ở [:256](src/runtime/providers.ts:256), lưu Vault `provider:claude:refresh` ([:837](src/runtime/providers.ts:837)). Ngang với đường Gemini.

### ✅ Q-01 — Anti-pattern `setState` đọc state
Đã hết trong `store.tsx`.

---

## ✅ PHẦN 2 — Em vừa fix trong lượt này

### 🔴→✅ P5a — AI Router chết là chết luôn *(nguyên nhân gốc của mọi lỗi chat)*

**Trước:** `spawn_ai_router` chạy **đúng một lần** lúc boot. Router chết → chết vĩnh viễn. Nút "Thử lại" chỉ fetch lại HTTP nên **không bao giờ cứu được**.

**Đã sửa:**
1. **Giám sát router** ngang với agent-runner — `supervise_ai_router()` ([runtime.rs](src-tauri/src/runtime.rs)): kiểm tra mỗi 5s, tự respawn, cap 5 lần, dump 10 dòng `ai-router.log` khi bó tay
2. **Lệnh `runtime_restart_ai_router`** + `Runtime::restart_ai_router()` — kill tiến trình cũ rồi spawn lại thật
3. **Nút "Thử lại" gọi respawn trước khi fetch** ([Settings.tsx:243](src/pages/Settings.tsx:243))

### 🔴→✅ P5b — Dev build và release app giết router của nhau

**Trước:** `kill_stale_port_process` chạy `pkill -f sidecar.mjs` **vô điều kiện** → giết **mọi** sidecar trên máy, kể cả của instance khác. Đây chính là lý do hai bản đá nhau suốt buổi test.

**Đã sửa:** probe port trước — port trống thì **không giết gì cả**; chỉ khi thật sự bị chiếm mới dọn, và **in cảnh báo rõ** rằng đang chiếm quyền của instance khác.

### 🔴→✅ P0-0b — Agent runner crash loop (Node 26)
`better-sqlite3` ^11 → **^13.0.1**. Kiểm chứng: vào `Entering poll loop`, heartbeat chạy, **0 crash** (trước 7+).
> ⚠️ Lần `npm rebuild` trước đó của em thất bại đã xoá binding cũ — việc nâng version khắc phục cả hai.

### 🟠→✅ CI không bắt được lỗi khởi động
`check:desktop-oauth` **giả định** router đã chạy sẵn → `npm run check` fail bằng stack `ECONNREFUSED` trần. Giờ script **tự spawn sidecar**, chờ ready, chạy assertion, kill. Đây đúng là smoke test khởi động em đề xuất — nó sẽ chặn được cả P0-0 lẫn P0-0b ngay từ CI.

---

## ℹ️ PHẦN 3 — Đính chính: 2 mục em báo sai ở lượt trước

| Mục | Em đã báo | Thực tế |
|---|---|---|
| **P1-3** Debounce persist | "chưa debounce" | ✅ **Đã có** — `setTimeout 500ms` + `clearTimeout` ([store.tsx:559](src/lib/store.tsx:559),[:602](src/lib/store.tsx:602)) |
| **P1-4** Tên user Claude | "hiển thị sai" | ✅ Hiển thị đúng **"Chau Le"** — ảnh cũ là từ build cũ |

---

## ⬜ PHẦN 4 — Còn lại

### 🟠 Tách 3 god file — **chưa làm**

| File | Dòng |
|---|---:|
| [Chat.tsx](src/pages/Chat.tsx) | **1.744** |
| [Settings.tsx](src/pages/Settings.tsx) | **1.741** |
| [store.tsx](src/lib/store.tsx) | **1.599** |

Chiếm ~33% source. Triệu chứng đo được: Vite liên tục báo `Could not Fast Refresh ("useApp" export is incompatible)` → mỗi lần sửa store là reload cả trang.

**Vì sao em chưa làm:** đây là refactor cơ học nhưng **rất lớn** (~5.000 dòng di chuyển, đụng gần như mọi import). Gộp chung vào lượt fix này sẽ tạo một diff khổng lồ không thể review, và trộn lẫn với các fix bảo mật/độ ổn định vừa rồi. Nên tách thành **một PR riêng**, làm từng file một, chạy `npm run check` sau mỗi bước.

**Thứ tự đề xuất:** `Settings.tsx` (dễ nhất, các section đã độc lập sẵn) → `Chat.tsx` → `store.tsx`.

### 🟡 i18n mới dùng một nửa
[i18n.ts](src/lib/i18n.ts) chỉ 79 dòng trong khi UI còn hàng trăm chuỗi tiếng Anh hardcode. Hoặc dùng đủ, hoặc bỏ hẳn.

### 🟡 Hai bộ provider stack
`providers.ts` vẫn còn 4 hàm stream gọi thẳng vendor. Giờ đây là **fallback có chủ đích** khi router chết — hợp lý, nhưng nên ghi rõ vào ARCH.md để không ai tưởng là code thừa.

---

## ✅ PHẦN 5 — Kiểm chứng sau khi fix

| Kiểm tra | Kết quả |
|---|---|
| `cargo check` (Rust) | 🟢 pass |
| `npx tsc --noEmit` | 🟢 pass |
| `npm run check` (14 bước) | 🟢 **pass, exit 0** (trước: fail) |
| `desktop-oauth-check` tự boot sidecar | 🟢 pass |
| Agent runner | 🟢 poll loop + heartbeat, 0 crash |

---

## 🗓️ PHẦN 6 — Việc tiếp theo

**Cần chạy thử trên app thật (em chưa test được vì app đang đóng):**
- [ ] Mở app → Settings → bấm "Thử lại" khi router chết → phải hồi phục được
- [ ] Chat với Antigravity/Gemini end-to-end

**Việc còn lại:**
- [ ] Tách 3 god file (PR riêng, từng file một)
- [ ] Chốt i18n: dùng đủ hay bỏ
- [ ] Ghi vào ARCH.md: provider stack trực tiếp là fallback có chủ đích

---

*Audit lượt 3. Mọi mục "đã fix" đều được kiểm chứng bằng đọc code tại `file:line` hoặc chạy thật; mục chưa làm được nói rõ lý do thay vì hứa suông.*
