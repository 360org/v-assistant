# Bàn giao — Di trú 4 hệ con sang Host Process

> Cập nhật: 2026-07-27 · Nhánh `dev`
> Mục tiêu (idea.md §1.3, §C): bộ não chạy ở **Host Process**, không phải webview.
> Đóng app vẫn phải chạy lịch và Telegram. **Chốt một công nghệ, build 1 chạy 3.**

---

## Backup trước khi refactor

| Loại | Tên |
|---|---|
| Git tag | `backup-pre-hostprocess-20260727-0945` |
| Git branch | `backup/pre-hostprocess-20260727-0945` |
| File | `~/v-assistant-backup-20260727-0945.tar.gz` (2.6M) |

---

## Tiến độ 4 hệ con

| # | Hệ con | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | **Scheduler** | ✅ **XONG** | `agent-runner/src/scheduler/` · 17 test · commit `a00f4d2` |
| 2 | **Telegram** | 🟡 **ĐANG LÀM — xong phía Router** | xem bên dưới |
| 3 | selfImprove | ⬜ Chưa | 87 dòng, ghi memory file per-agent |
| 4 | Knowledge/RAG | ⬜ Chưa | 592 dòng, phải chuyển IndexedDB → SQLite |

---

## Telegram — đang dở, làm tiếp từ đây

### Vì sao không thể dùng Connector Gateway
Telegram đặt bot token **trong URL path** (`/bot<token>/getUpdates`). Gateway **cấm** credential trong URL:
```js
if (/\{\{credential:/i.test(target.href))
  throw new Error("Credential variables are not allowed in connector URLs.");
```
`/v1/vault/manifest` chỉ trả metadata, không trả giá trị. Runner không có đường đọc Vault.

→ **Phương án đã chốt (A):** đặt Telegram channel **trong AI Router** — thành phần duy nhất được resolve secret. Token không bao giờ rời router.

### ✅ Đã làm (phía Router) — `ai-router/src/sidecar.mjs`
Ba endpoint, đều yêu cầu `Authorization: Bearer <AI_ROUTER_CONNECTOR_TOKEN>`:

| Endpoint | Method | Tác dụng |
|---|---|---|
| `/v1/channels/telegram/status` | GET | Có token chưa (không lộ giá trị) |
| `/v1/channels/telegram/updates` | POST `{offset,timeout}` | Long-poll, trả `{updates:[{updateId,text,chatId}]}` |
| `/v1/channels/telegram/send` | POST `{chatId,text}` | Gửi tin nhắn |

Kèm `telegramCredentials()` đọc Vault entry có nhãn/service khớp `telegram`, lấy field `bot token` / `chat id`. Lỗi trả về đều đi qua `redactSecrets()`.

**Đã kiểm chứng:** `node --check` sạch; router boot; `/v1/models` → 200; `/v1/channels/telegram/status` → **401 khi thiếu token** (đúng).

### ⬜ Còn phải làm (phía Runner)
1. Tạo `agent-runner/src/channels/telegram.ts`:
   - Vòng long-poll gọi 3 endpoint trên (`VUA_AI_ROUTER_URL` + `VUA_CONNECTOR_GATEWAY_TOKEN` đã có sẵn trong env runner).
   - Bỏ qua backlog lần đầu (`drained`), giống bản webview cũ.
   - Mỗi tin nhắn → `executeAgentLoop(...)` (đã export ở `poll-loop.ts`) → gửi trả bằng `/send`.
   - Ghi cả lượt vào `messages_out` để UI thấy hội thoại.
   - Giữ transcript theo `sessionId = telegram:<chatId>` (dùng `getTranscript`/`setTranscript` trong `db/session-state.ts`).
2. Gọi `startTelegramChannel(loopConfig)` trong `agent-runner/src/index.ts` (cạnh `startScheduler`).
3. Test `agent-runner/scripts/telegram-check.mjs` (stub fetch tới router, stub provider) + đăng ký vào `package.json` scripts `test`/`check`.
4. Gỡ Telegram khỏi webview: `src/runtime/telegram.ts` và chỗ gọi trong `src/lib/store.tsx`.

---

## Việc tồn đọng khác

### 🔴 Push bị chặn — cần `workflow` scope
Commit `2950b10` sửa `.github/workflows/release.yml`. Không tách được vì `scripts/desktop-bundle-contract-check.mjs` kiểm chứng chính nội dung workflow đó.
```bash
git push origin dev
```

### 🔴 Regression Grok Web — `npm run check` ở root đang đỏ
Commit `da49b43` (tách god file) làm mất UI gọi `captureGrokWebSsoCookie` + `saveSubscriptionCookie`. Trước refactor có 4 chỗ, nay 0. Cần khôi phục vào `src/components/settings/ModelSettings.tsx`.
Code cũ lấy tại: `git show da49b43~1:src/pages/Settings.tsx` (dòng ~596 và ~1305).

---

## Nền tảng đã chốt (đừng làm lại)

- **`node:sqlite`** thay `better-sqlite3` → runner **0 runtime dependency**, thuần JS, một `dist/index.js` chạy cả 3 nền tảng. Bundle contract sẽ **fail nếu native addon quay lại**.
- **Workspace sandbox** đã vá: `workspacePath()` chặn cả đường dẫn tuyệt đối lẫn `../`, kiểm qua symlink hai phía.
- Quy trình test: **không Docker**. `npm run tauri dev` (nhanh) hoặc `npm run build:local` (bản cài), rồi thao tác thật trên UI.
- Đọc `skills/v-assistant-dev-guidelines/SKILL.md` trước khi sửa — **Luật số 1: bám idea.md**.
