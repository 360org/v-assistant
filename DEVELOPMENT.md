# Quy trình phát triển

Chạy live → test → commit → cắt phiên bản. Không có gì được phát hành khi chưa xanh.

## 1. Chạy live

**Web preview (nhanh nhất, hot reload):**

```bash
npm install     # lần đầu
npm run dev      # → http://localhost:1420
```

"Continue with OpenRouter" là đăng nhập thật trên localhost; các vendor khác định
tuyến qua model của OpenRouter. Ở đây credential nằm trong trình duyệt.

**Docker (Colima) — không cài gì trên máy host:**

Runtime là [Colima](https://github.com/abiosoft/colima), không phải Docker Desktop.
Cài một lần:

```bash
brew install colima docker docker-compose
```

Rồi dùng script `dev.sh` — nó tự khởi động Colima khi cần:

```bash
./dev.sh up        # bật → http://localhost:1420 (lần đầu ~1 phút)
./dev.sh logs      # xem log dev server
./dev.sh restart   # restart sau khi đổi cấu hình
./dev.sh stop      # tạm dừng (giữ container)
./dev.sh start     # chạy lại
./dev.sh down      # dừng và xóa (giữ volume node_modules)
./dev.sh reset     # dựng lại từ đầu (node_modules mới)
./dev.sh shell     # mở shell trong container dev
./dev.sh status    # trạng thái Colima + container
```

Không cần Node hay Rust trên máy — mọi thứ chạy trong container. Source được
bind-mount vào, nên sửa file trên host là app hot-reload ngay. `node_modules` nằm
trong volume riêng (binary build trong container không đụng vào host). Cái này chạy
bản **web** (Vault dùng bộ nhớ trình duyệt); đăng nhập thật với OpenRouter chạy
được trên localhost.

Bên dưới, `dev.sh` bọc `docker compose -f docker-compose.dev.yml`, nên anh vẫn có
thể dùng Compose trực tiếp nếu thích.

**App desktop (bản thật, hot reload):**

```bash
npm run tauri dev
```

Mở đúng cửa sổ V Assistant thật. Cần Rust toolchain và thư viện webview của OS
(WebKitGTK trên Linux, WebView2 trên Windows, có sẵn trên macOS). Credential nằm
trong OS keychain (Vault). (Cửa sổ desktop là GUI native nên không chạy trong
Docker được — dùng trực tiếp trên máy.)

## 2. Test trước khi commit

Một lệnh chạy cả build production **và** toàn bộ kiểm thử đầu-cuối (agent tools,
Telegram, scheduler, đăng nhập, cô lập vai trò, self-improve, connectors, RAG):

```bash
npm run check
```

Phía Agent Runner (backend độc lập):

```bash
cd agent-runner
npm install
npm run check    # typecheck + e2e (poll loop + SQLite IPC) + native tools
```

Phía Rust (vỏ desktop + sandbox):

```bash
cd src-tauri
cargo check
cargo run --example oauth_loopback_check
cargo run --features sandbox --example sandbox_check
```

Chỉ commit khi `npm run check` xanh. CI chạy đúng các kiểm thử này mỗi lần push,
nên một bản đỏ không bao giờ được merge.

## 3. Commit

```bash
git add -A && git commit -m "…"
git push
```

## 4. Cắt một phiên bản phát hành

```bash
npm run version:set 0.1.1        # đổi version ở package.json, tauri.conf.json, Cargo.*
# chuyển mục "Chưa phát hành" trong CHANGELOG.md → "[0.1.1]"
npm run check                    # xanh
git commit -am "release: v0.1.1"
git tag v0.1.1 && git push --tags
```

Đẩy tag `vX.Y.Z` sẽ kích hoạt workflow **Release** — nó build installer cho macOS
(Apple Silicon + Intel), Windows và Linux rồi đăng lên một GitHub Release. Anh cũng
có thể chạy workflow đó bằng tay từ tab Actions.
