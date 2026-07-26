# 📋 Báo cáo Audit — V-Assistant

> **Ngày:** 2026-07-26 (lượt 4) · **Nhánh:** `dev` — sạch, khớp `origin/dev`
> **Mốc so sánh:** report lượt 2 (v1.0.82) và lượt 3 (v1.0.83)
> **Phương pháp:** kiểm chứng bằng `grep file:line` + chạy thật (`cargo check`, `tsc`, `npm run check`, `npm run build`)

---

## 🎯 Kết luận 30 giây

| | |
|---|---|
| Task đã đóng | **11/14** (79%) |
| Task còn lại | **3** — đều là tối ưu/dọn dẹp, **không có mục bảo mật nào** |
| Sức khoẻ build | 🟢 `cargo check` · `tsc` · `npm run check` (**84 assertion pass**) · `npm run build` — tất cả xanh |
| Trạng thái code | Đã commit + push (`66348b7 release: v1.0.83 — fix AUDIT.md P0/P1 issues…`) |

---

## ✅ PHẦN 1 — 11 task đã đóng (kiểm chứng trong HEAD)

### 🔒 Nhóm bảo mật — **6/6 xong**

| # | Task | Bằng chứng | Ai làm |
|---|---|---|---|
| SEC-05 | Shell injection `grep`/`glob` | `execFileSync` ×3, `execSync` chuỗi = **0** | Antigravity |
| P0-1 | Native tools không rào | `workspacePath()` ×6, tool `bash` = **0 (gỡ hẳn)** | Antigravity |
| P0-1b | Agent đọc được secret | *"Credential access denied"* | Antigravity |
| SEC-06 | Exfiltrate credential | `allowedOrigin` ×2 + redirect manual + redact | Antigravity |
| P0-2 | Claude token hết hạn là gãy | `refreshClaudeToken` ×2 + lưu Vault | Antigravity |
| Q-01 | Anti-pattern `setState` | đã hết | Antigravity |

### ⚙️ Nhóm độ ổn định — **5/5 xong**

| # | Task | Bằng chứng | Ai làm |
|---|---|---|---|
| P0-0 | Sidecar không tìm thấy ở dev | walk-up tìm `ai-router/src/sidecar.mjs` | Claude |
| P0-0b | Runner crash loop trên Node 26 | `better-sqlite3` **^13.0.1** | Claude |
| P5a | **Router chết là chết luôn** | `supervise_ai_router` ×2 + `runtime_restart_ai_router` | Claude |
| P5b | Dev/release giết router của nhau | `TcpListener::bind` probe trước khi `pkill` | Claude |
| CI | Test không bắt được lỗi khởi động | `ensureRouter` — script tự boot sidecar | Claude |

> **P5a là mục quan trọng nhất**: đó là nguyên nhân gốc khiến chat báo "Load failed" suốt. Router giờ được giám sát 5s/lần, tự respawn (cap 5 lần), và nút "Thử lại" gọi respawn thật thay vì chỉ fetch lại.

### ℹ️ 2 mục em từng báo nhầm — đã đính chính

| Mục | Em báo | Thực tế |
|---|---|---|
| P1-3 debounce | "chưa có" | ✅ đã có `setTimeout 500ms` + cleanup |
| P1-4 tên user Claude | "sai" | ✅ hiển thị đúng "Chau Le" |

---

## ⚡ PHẦN 2 — Tối ưu đã đi đến đâu?

### Đã tối ưu tốt

| Hạng mục | Số đo | Đánh giá |
|---|---|---|
| Runtime dependency | **8** | 🟢 Rất gọn (agent-runner: 1) |
| Dynamic import | **21** chỗ | 🟢 Tốt |
| `pdfjs` (nặng nhất) | Tách riêng **458 kB** + worker **1.187 kB** | 🟢 Lazy-load đúng, không nằm trong bundle chính |
| CSS | 82.79 kB → **gzip 12.53 kB** | 🟢 Tốt |

### Chưa tối ưu — đây là phần còn lại

| Hạng mục | Số đo | Vấn đề |
|---|---|---|
| **Bundle chính** | `index.js` **645 kB** (gzip **190 kB**) | 🟠 Nặng |
| **`React.lazy`** | **0** | 🔴 Cả 12 page nạp ngay lúc mở app |
| **God files** | Chat **1.747** · Settings **1.755** · store **1.599** | 🔴 Không giảm — Settings còn *tăng* 14 dòng |
| **framer-motion** | Chỉ dùng ở **2 file** | 🟡 Trả giá cả thư viện cho 2 chỗ |
| **i18n** | `i18n.ts` 79 dòng | 🟡 Nửa vời, UI còn nhiều chuỗi hardcode |

**Tổng source:** 15.673 dòng (lượt 2: 15.431) → **+242 dòng**. Tức là đang thêm tính năng, chưa có đợt dọn nào.

---

## ⬜ PHẦN 3 — 3 task còn lại

### 🔴 T-1 — Tách 3 god file *(nợ kỹ thuật lớn nhất)*

5.101 dòng trong 3 file = **33% source**. Triệu chứng đo được: Vite liên tục báo
`Could not Fast Refresh ("useApp" export is incompatible)` → mỗi lần sửa store là reload cả trang.

**Vì sao chưa làm:** refactor cơ học nhưng ~5.000 dòng di chuyển, đụng gần hết import. Trộn chung với các fix bảo mật vừa rồi sẽ tạo diff không review nổi.

**Đề xuất:** PR riêng, thứ tự `Settings.tsx` → `Chat.tsx` → `store.tsx`, chạy `npm run check` sau mỗi file.

### 🟠 T-2 — Code-split các page (`React.lazy`)

Hiện `React.lazy = 0`. Bọc lazy cho MediaGallery, Vault, Knowledge, Sessions, Skills → ước tính **giảm 30-40% bundle khởi động**. Công ~2 giờ, đây là **việc rẻ nhất mà hiệu quả rõ nhất** trong danh sách.

### 🟡 T-3 — Chốt i18n & bỏ framer-motion

- i18n: dùng đủ hay bỏ hẳn, đừng để nửa vời
- framer-motion: 2 file → thay bằng CSS transition, giảm ~100 kB gzip

---

## 📊 PHẦN 4 — Tiến độ qua các lượt

| Lượt | Task mở | Bảo mật chưa fix | `npm run check` |
|---|:---:|:---:|---|
| Lượt 2 (v1.0.82) | 14 | 4 | 🔴 fail |
| Lượt 3 (v1.0.83) | 3 | 0 | 🟢 pass |
| **Lượt 4 (nay)** | **3** | **0** | 🟢 **pass (84 assertion)** |

Giữa lượt 3 và lượt 4 **không có task nào được đóng thêm** — code có thay đổi (+242 dòng) nhưng là thêm tính năng, không phải dọn dẹp.

---

## 🗓️ PHẦN 5 — Đề xuất thứ tự

1. **T-2 code-split** — 2 giờ, hiệu quả thấy ngay, rủi ro thấp → làm trước
2. **T-1 tách god file** — 1 ngày, PR riêng từng file
3. **T-3 i18n + framer-motion** — dọn nốt

**Chưa kiểm chứng được:** chạy thử app thật để xác nhận nút "Thử lại" hồi phục router và chat Antigravity end-to-end. Mọi thứ khác đều đã verify bằng test tự động.

---

*Audit lượt 4. Mục "đã fix" đều verify bằng grep trong HEAD; số đo tối ưu lấy từ `npm run build` thật.*
