# Nhật ký thay đổi (Changelog)

Ghi lại mọi thay đổi đáng chú ý của V Assistant. Định dạng theo
[Keep a Changelog](https://keepachangelog.com/); phiên bản theo
[SemVer](https://semver.org/).

## [Chưa phát hành]

## [1.1.49] - 2026-08-04

### Hotfix Windows AI Router
- AI Router chờ endpoint `/health` sẵn sàng trước khi báo khởi động thành công; lỗi startup kèm log tail để chẩn đoán.
- Onboarding polling health tối đa 10 giây sau restart thay vì chờ cứng 2,5 giây, tránh kẹt ở bước đăng nhập AI account.
- Không kill bừa process ngoài khi port `20128` bị chiếm; chỉ dừng đúng process AI Router có `sidecar.mjs`.
- Windows release smoke test bắt buộc kiểm tra `v-assistant.exe`, `sidecar.mjs`, Agent Runner `index.js` và `node.exe` sau cài đặt.

### Kiểm chứng
- `npm run check` — pass toàn bộ.
- Contract resource/runtime, OAuth, Host Process, credential boundary, connector, isolation và RAG — pass.

## [1.1.48] - 2026-08-04

### Sửa lỗi Windows/Desktop
- AI Router giờ chờ endpoint `/health` sẵn sàng trước khi báo khởi động thành công; lỗi startup kèm log tail để chẩn đoán.
- Onboarding polling health tối đa 10 giây sau restart thay vì chờ cứng 2,5 giây, tránh kẹt ở bước đăng nhập AI account.
- Không còn kill bừa process ngoài khi port `20128` bị chiếm; chỉ dừng đúng process AI Router có `sidecar.mjs`.
- Windows release smoke test bắt buộc kiểm tra `v-assistant.exe`, `sidecar.mjs`, Agent Runner `index.js` và `node.exe` sau cài đặt.

### Kiểm chứng
- `npm run check` — pass toàn bộ.
- Contract resource/runtime, OAuth, Host Process, credential boundary, connector, isolation và RAG — pass.

## [1.1.47] - 2026-08-04

### Sửa lỗi Windows/Desktop
- **Native menu desktop**: Bổ sung cấu trúc menu macOS gồm V Assistant, File, Edit, View, Window và Help.
- **Filesystem approval**: Cho phép chọn file hoặc thư mục để cấp quyền đọc cho Agent Runner; đường dẫn được chuẩn hóa trước khi lưu.
- **Updater placement**: Đưa khu vực cập nhật phần mềm lên đầu trang Settings và hiển thị nút cập nhật rõ ràng trên Sidebar.
- **Local build**: Tắt updater artifacts cho `build:local` để bản cài local không bị nhầm là release artifact.
- **Checklist và skill workflow**: Bổ sung checklist multi-sub-agent và skill xử lý GitHub Issues.

### Kiểm chứng
- `npm run check` — pass toàn bộ trên `main` sau merge.
- Desktop bundle, OAuth, Host Process, AI Router, credential boundary, connector, isolation và RAG — pass.

## [1.1.41] - 2026-08-02

### Sửa lỗi Windows/Desktop
- **Native menu desktop**: Bổ sung cấu trúc menu macOS gồm V Assistant, File, Edit, View, Window và Help.
- **Filesystem approval**: Cho phép chọn file hoặc thư mục để cấp quyền đọc cho Agent Runner; đường dẫn được chuẩn hóa trước khi lưu.
- **Updater placement**: Đưa khu vực cập nhật phần mềm lên đầu trang Settings và hiển thị nút cập nhật rõ ràng trên Sidebar.
- **Local build**: Tắt updater artifacts cho `build:local` để bản cài local không bị nhầm là release artifact.
- **Checklist và skill workflow**: Bổ sung checklist multi-sub-agent và skill xử lý GitHub Issues.

### Kiểm chứng
- `npm run check` — pass toàn bộ trên `main` sau merge.
- Desktop bundle, OAuth, Host Process, AI Router, credential boundary, connector, isolation và RAG — pass.

## [1.1.41] - 2026-08-02

### Thêm mới
- **Capability rail nội bộ cho Agent Runner**: Agent có thể tìm và chạy native tools, built-in tools và MCP tools qua một bề mặt thống nhất.
- **Cổng duyệt thao tác nhạy cảm**: Gửi tin, gửi file ra ngoài, sửa message và connector có credential yêu cầu người dùng phê duyệt trước khi thực thi.
- **Câu hỏi tương tác và lịch chạy**: Bổ sung `ask_user_question`, `schedule_message`, `list_scheduled` và `cancel_scheduled` cho Agent Runner.
- **Phím tắt macOS**: Thêm `Cmd+Shift+Q` ẩn/hiện cửa sổ, `Cmd+Shift+R` tải lại ứng dụng và `Cmd+Shift+E` phát sự kiện cho webview.
- **Remote MCP và chẩn đoán**: Cấu hình MCP từ URL và xuất gói chẩn đoán đã che thông tin nhạy cảm.

### Sửa lỗi và bảo mật
- Telegram đi qua hàng đợi SQLite inbound/outbound thay vì gọi trực tiếp agent loop, đồng bộ với kiến trúc Host Process.
- Chuẩn hóa toàn bộ approved roots trước khi kiểm tra containment, ngăn path traversal qua đường dẫn tương đối.
- RAG, Scheduler và self-improve memory chạy trong Host Process để tiếp tục hoạt động khi đóng cửa sổ.
- Skill Store lưu nguồn và version của skill để người dùng biết xuất xứ trước khi bật.

### Kiểm chứng
- `npx tsc --noEmit` — đạt.
- `npx tsc --project agent-runner/tsconfig.json --noEmit` — đạt.
- `cargo check --quiet` — đạt.
- `npm run build` — đạt, 2.009 module.

## [1.1.2] - 2026-07-26

- **Persistent Background Task Execution**: Giữ trang Trò chuyện (`Chat`) luôn mounted ngầm trong DOM (`hidden` khi ở trang khác). Khi Agent đang thực thi tác vụ (đọc/ghi tệp, gọi API, đặt lịch...), người dùng chuyển qua menu/trang khác (Lịch & Nhiệm vụ, Kho Media, Cài đặt...) thì tiến trình vẫn tiếp tục chạy hoàn tất 100% mà không bị dừng hay báo lỗi Retry.

## [1.1.1] - 2026-07-26

- **Lịch & Nhiệm vụ Menu**: Đổi tên nhãn menu hiển thị ở Sidebar từ "Lịch đăng bài & Tác vụ" thành **"Lịch & Nhiệm vụ"**.
- **Native Tool `schedule_task`**: Tích hợp công cụ native cho Agent Runner tự động đưa tác vụ lên lịch vào mục **Lịch & Nhiệm vụ** của ứng dụng V-Assistant.
- **Backup Timestamp & Success Banner**: Xuất file backup kèm timestamp đầy đủ (`v-assistant-backup-YYYY-MM-DD_HHmmss.json`) và hiển thị thông báo thành công.
- **Run on Startup Option**: Thêm công tắc tự động khởi động cùng hệ thống trong Cài đặt hệ thống (bật/tắt daemon `LaunchAgents` trên macOS).
- **Fix File Upload Hanging**: Thêm cơ chế Hard Timeout 4s/6s chống kẹt trạng thái **Processing** khi nạp tệp PDF, DOCX, XLSX, hình ảnh.
- **Claude Desktop Capabilities Roadmap**: Bổ sung Checklist mục 13 chi tiết các tính năng Computer Use & Advanced Capabilities.

## [1.0.15] - 2026-07-20

### Sửa lỗi
- **OAuth credential rotation trong AI Router.** Khi provider trả `401` và refresh token tạo access/refresh token mới, AI Router ghi ngay credential đã refresh về App Vault. Các lần chat sau hoặc sau khi khởi động lại không còn quay về token cũ đã hết hạn.
- **Trạng thái session bị thu hồi.** Claude, Grok và các provider OAuth khác trả `401`/`403` giờ chuyển connection sang `Failed` với hướng dẫn Reset và đăng nhập lại, thay vì giữ nhãn `Verified` hoặc hiển thị JSON lỗi upstream thô.

### Kiểm chứng
- **Runtime desktop macOS.** Đã kiểm tra trực tiếp AI Router trong ứng dụng cài đặt: Gemini/Antigravity và ChatGPT/Codex trả `200` từ upstream. Grok Build có token bị xAI thu hồi được báo rõ cần đăng nhập lại.

### Sửa lỗi
- **Desktop AI Router CORS.** Router tin cậy origin WebView của Tauri, nên
  onboarding và Settings có thể tải catalog vendor thay vì chỉ hiện `Load failed`.
- **Provider Core package nội bộ.** `open-sse` kế thừa chạy trực tiếp từ một
  bản source dưới `ai-router/core`; bundle desktop không còn vô tình load bản
  copy trong `node_modules` với các đường dẫn nội bộ sai.
- **Standalone macOS AI Router.** Release bundle mang Node runtime tối thiểu
  và dependency runtime (`undici`, `uuid`, `node-machine-id`) cho AI Router
  Core qua lockfile npm đã kiểm soát, resolver nhận đúng layout Tauri
  `Resources/_up_`, và ghi lỗi khởi động sidecar vào `ai-router.log` thay vì
  chỉ trả `Load failed`.
- **Gemini/Claude desktop OAuth.** Authorization-code exchange và Antigravity
  project setup chạy trong AI Router sidecar. WebView chỉ giữ callback code để
  dán, không còn gọi trực tiếp Google/Anthropic rồi trả lỗi mạng `Load failed`.
- **Desktop packaged runtime.** Bản cài dùng đúng thư mục `Contents/Resources`
  để khởi chạy AI Router/Agent Runner đã bundle, thay vì nhầm thư mục chạy của
  ứng dụng. Mục About lấy version từ manifest khi build, không còn hard-code
  `0.1.0`.
- **Desktop first sign-in.** Sau khi mở trang xác thực AI, onboarding desktop
  hiển thị ngay bước dán callback URL hoặc authorization code. Hoàn tất đổi
  code xong sẽ tạo kết nối, lưu qua Vault boundary hiện có và vào thẳng Chat.
  Luồng này không còn phụ thuộc vào event callback tự động có thể đến trước khi
  WebView kịp đăng ký listener.

### Quy ước phát hành
- Mọi tính năng hoàn tất phải có mục changelog trước khi merge vào `main`.
- Mỗi commit `main` cắt một patch release mới; bản cài macOS Intel và Apple
  Silicon được build trước, còn Windows/Linux chạy qua workflow thủ công.
  Release thành công được publish tự động thay vì để dạng draft.

## [1.0.1] — 2026-07-19

### Thêm mới
- **AI Router native.** Provider Core được đưa vào V Assistant để quản lý hơn
  100 vendor tại chỗ, không kết nối runtime sang 9router. Kết nối có thể dùng
  subscription OAuth/device flow hoặc API key theo adapter của từng vendor.
- **Vault-backed AI accounts.** Mỗi connection giữ một `credentialRef` opaque;
  token, refresh token và cookie được AI Router lấy từ Vault, không đưa qua
  agent/model hay hiển thị trong UI. Nhiều tài khoản cho cùng vendor được giữ
  riêng theo account label/email.
- **Packs cho model.** Người dùng có thể gom model đã kết nối thành pack,
  thiết lập fallback hoặc round-robin, chỉnh sửa/xoá pack, và ưu tiên pack ở
  đầu danh sách chọn model. Bộ chọn mở rộng hỗ trợ lọc theo account.
- **Local User.** Đăng nhập Gemini, GPT, Claude hoặc Grok lần đầu tự tạo Local
  User trên thiết bị. Tên hiển thị chỉnh sửa được và có logout xác nhận: gỡ
  connection tạo profile cùng credential Vault của nó, không ảnh hưởng vendor
  khác.
- **Vault UI cho AI credentials.** Hiển thị tên provider, account label/email,
  trạng thái và Vault reference; người dùng có thể sửa metadata mà không làm
  lộ bí mật.

### Thay đổi
- Settings chỉ hiển thị model từ provider/account đã kết nối thực sự. Trạng
  thái AI account của Local User không còn suy diễn từ toàn bộ vendor
  connections.
- Dropdown model hiển thị nguồn đầy đủ `provider · account`, giúp phân biệt
  cùng model giữa nhiều tài khoản.
- Bundle identifier desktop đổi thành `com.vuaai.assistant`.
- Release workflow chỉ chạy khi có push vào `main`; mỗi lần chạy tự tăng patch
  từ tag SemVer gần nhất, đồng bộ version vào package, lockfile, Tauri và Cargo.

### Sửa lỗi
- Provider bị quota/permission khi test sau OAuth không còn xoá kết quả đăng
  nhập hợp lệ; connection và credential vẫn được giữ, lỗi test được báo riêng.
- Sửa fallback khi vendor trả rate-limit và định tuyến lại vendor khả dụng.
- Sửa build macOS khi đọc Chrome Keychain cho Grok session capture.
- Sửa trạng thái `connected` của Local User để chỉ phản ánh tài khoản đã tạo
  profile, không phải tất cả AI Router connections.

### Phát hành
- GitHub Actions đã build thành công DMG `x86_64` và `aarch64` cho v1.0.1.
  Bản macOS hiện chưa được Developer ID code-sign/notarize.

## [1.0.0] — 2026-07-17

App giờ chạy engine agent **ngay trong ứng dụng** — cài, đăng nhập, dùng.
Không Docker, không engine tách rời, không cấu hình.

### Thêm mới
- **Agent thao tác qua Vault.** Vòng lặp tool-calling trong app cho phép agent
  chạy công cụ thật: `vault_list` (liệt kê thông tin đăng nhập đã lưu — chỉ tên
  và tên field, không bao giờ lộ giá trị bí mật) và `http_request` (thực hiện
  hành động như đăng bài blog hoặc gọi API). Bí mật được tham chiếu bằng
  placeholder `{{vault:Tên.field}}` và thay tại chỗ, nên mật khẩu/khóa không bao
  giờ lọt vào model. Đã kiểm chứng đầu-cuối (`scripts/tool-loop-check.mjs`).
- **Telegram 2 chiều trong app.** Dán token của @BotFather rồi nhắn cho bot; bot
  trả lời bằng chính trợ lý đó (provider + agent + công cụ Vault). Kênh đọc token
  từ Vault, long-poll Telegram, tự bật/tắt theo integration. Đổi provider/agent
  có hiệu lực ngay. Đã kiểm chứng (`scripts/telegram-check.mjs`).
- **Việc hẹn giờ chạy thật.** Mỗi phút kiểm tra một lần, chạy mọi task đến hạn
  qua trợ lý và giao kết quả vào chat và (nếu đã kết nối) Telegram. Nhận biết lịch
  hằng ngày / ngày trong tuần / thứ chỉ định / mỗi giờ / hằng tháng với giờ
  "at HH:MM". Đã kiểm chứng (`scripts/schedule-check.mjs`).
- **CI phủ toàn bộ** các mục trên, cộng logic đăng nhập trực tiếp
  (`scripts/login-check.mjs`): đổi code→key bằng PKCE (S256), định tuyến đúng
  model từng vendor, và tạo user local.
- **Vai trò cô lập, chuyển tức thì.** Knowledge và memory giờ tách theo từng vai
  trò: chọn Sales Expert thì có kiến thức của Sales; chuyển sang Marketing thì
  đổi sạch, không lẫn. Chuyển vai trò tức thì (thuần state, không khởi động lại).
  Đã kiểm chứng (`scripts/isolation-check.mjs`).
- **Bộ nhớ tự học (kiểu Hermes).** Sau mỗi lượt, vai trò tự suy ngẫm và lưu các
  sự thật bền vững về người dùng vào bộ nhớ riêng của mình (khử trùng lặp, có giới
  hạn); có công tắc trong Settings. Đã kiểm chứng (`scripts/self-improve-check.mjs`).
- **WASM sandbox chạy code (tùy chọn)** (feature Cargo `sandbox`, tắt mặc định để
  app nhẹ và khởi động tức thì). Code guest chạy không có host import, có trần bộ
  nhớ và ngân sách fuel — code chạy loạn hay độc hại đều bị chặn, không hại máy
  host. Đã kiểm chứng (`examples/sandbox_check`).
- **Connectors.** Một integration đã kết nối (GitHub, Notion, Slack, Discord,
  Telegram, …) trở thành plugin agent gọi theo tên; connector tự lấy credential
  từ Vault và tự áp đúng cơ chế xác thực của từng hệ thống. Token không bao giờ
  đi qua model. Đã kiểm chứng (`scripts/connector-check.mjs`).
- **Knowledge đọc tài liệu thật (RAG).** File thả vào được trích xuất thật — PDF
  (pdfjs), Word/Excel/PowerPoint (parse ZIP+XML gốc, không cần thư viện ngoài),
  text/Markdown/CSV/HTML — chia chunk và lập chỉ mục theo từng vai trò trong
  IndexedDB. Mỗi lượt chat truy xuất các đoạn khớp câu hỏi nhất và trả lời dựa
  trên đó, có trích nguồn. Lỗi hiện rõ trên UI (ví dụ PDF scan không có text,
  `.doc` cũ). Truy xuất theo từ khóa (tf-idf) — riêng tư, không gì rời khỏi máy.
  Đã kiểm chứng đầu-cuối với file docx/xlsx/pptx/pdf thật (`scripts/rag-check.mjs`).

### Thay đổi
- Engine giờ được mô tả là nhúng và luôn sẵn sàng; một NanoClaw host bên ngoài là
  phần gắn thêm nâng cao tùy chọn, không bắt buộc cho sử dụng thông thường.

### Đã biết / chưa tự động hóa
- Vòng OAuth redirect thật và round-trip qua openrouter.ai vẫn cần kiểm tra tay
  trên desktop thật (CI không có trình duyệt). Phần *logic* đăng nhập đã được phủ
  bởi `scripts/login-check.mjs`.
- Các mục nâng cao còn trong kế hoạch: OAuth integrations (Drive/Outlook/Calendar),
  bộ skill riêng theo vai trò, và MCP client.

## [0.1.0] — 2026-07-11

Bản cài đặt đầu tiên cho macOS, Windows và Linux.

### Thêm mới
- **Onboarding & đăng nhập:** luồng login-first với 1-click "Continue with
  ChatGPT / Claude / Gemini / OpenRouter" qua OpenRouter PKCE OAuth (không cần
  API key); API key có sẵn trong Advanced options. Lần đăng nhập đầu tự tạo user
  local từ tài khoản vendor.
- **AI providers:** chat streaming thật qua Anthropic, Google Gemini và các API
  tương thích OpenAI (OpenRouter / OpenAI / server nội bộ); đổi provider 1-click.
- **Credential Vault:** bí mật lưu trong OS keychain trên desktop; entry có field
  mặc định và field tùy chỉnh có kiểu (text, password, number, URL, email, date,
  datetime) kèm icon tương ứng.
- **Skills:** [Agent Skills](https://agentskills.io) chuẩn, dựng sẵn; cài skill từ
  URL; skill đang chạy điều hướng cuộc chat. Có catalog engine-skills của NanoClaw
  (channels/providers/capabilities).
- **Agents:** agent store cài được; Instructions, Soul và Memory riêng từng agent,
  tiêm vào system prompt.
- Các trang **Knowledge, Integrations, Scheduled, Settings**; cấu hình bot-token
  Telegram; giao diện responsive; logo thương hiệu và icon ứng dụng.
- **Vỏ desktop (Tauri):** loopback OAuth, Vault qua OS-keychain, runtime service;
  CI (frontend + Rust) và workflow phát hành tạo installer cho macOS (arm64/x64),
  Windows và Linux.
