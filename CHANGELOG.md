# Nhật ký thay đổi (Changelog)

Ghi lại mọi thay đổi đáng chú ý của V Assistant. Định dạng theo
[Keep a Changelog](https://keepachangelog.com/); phiên bản theo
[SemVer](https://semver.org/).

## [Chưa phát hành]

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
