# CHANGELOGS: Nhật ký Phát triển V-Assistant (Zero-Docker / Đa nền tảng)

Nhật ký ghi lại các cột mốc thay đổi kiến trúc và tái cấu trúc hệ thống.

## [1.0.39] - 2026-07-23
### Added & Configurable Host Data Storage Location
*   Bổ sung tính năng **Cấu hình Nơi lưu trữ dữ liệu trên máy Host (Data Storage Location)** trong trang **Settings**:
    - Hiển thị công khai đường dẫn lưu trữ dữ liệu hiện tại trên hệ thống (ví dụ: `~/.v-assistant/data` hoặc thư mục tùy chỉnh).
    - Cung cấp nút **`📂 Chọn thư mục`** (kích hoạt trình chọn thư mục hệ thống), nút **`✏️ Nhập đường dẫn thủ công`**, nút **`💾 Lưu vị trí`** và nút **`🔄 Đặt lại mặc định`**.
    - Cho phép người dùng linh hoạt đổi nơi lưu toàn bộ cơ sở dữ liệu chat, file kiến thức, IndexedDB sang các vị trí mong muốn như ổ cứng SSD rời, USB hoặc các thư mục đám mây (iCloud Drive, Google Drive, OneDrive) để tự động backup dữ liệu an toàn.

## [1.0.38] - 2026-07-23
### Added & Dynamic Banner
*   Thêm **Banner quảng cáo dịch vụ Vua AI Agentic (vuaai.net)** tại khoảng trống góc dưới Sidebar:
    - Thiết kế giao diện Card hiện đại với viền phát sáng Emerald, huy hiệu `⚡ Vua AI — 360 CORP`, thông tin giải pháp "Thuê Nhân Sự AI 24/7 - Xóa 6 rào cản tăng trưởng" và nút bấm chuyển đổi.
    - Hỗ trợ cơ chế **Auto-Sync Dynamic Banner**: Tự động kết nối và tải thông tin banner mới nhất từ backend `vuaai.net` theo thời gian thực mỗi khi quản trị viên cập nhật banner mới trên website!

## [1.0.37] - 2026-07-22
### Fixed & Confined Error Scope
*   Sửa triệt để phạm vi hiển thị lỗi khi **Test connection**: Thông báo lỗi và nút **`🌐 Xác thực lại tại trình duyệt`** hiện tại chỉ nằm gọn gàng 100% bên trong thẻ Block Card của đúng tài khoản đó, tuyệt đối không đè hay làm ẩn danh sách các kết nối AI khác.

## [1.0.36] - 2026-07-22
### Security & Per-User Storage Isolation
*   Xây dựng cơ chế **Per-User Storage Isolation (Cô lập không gian dữ liệu riêng cho từng Local User)**: Khi người dùng **Log out**, hệ thống cất giữ và bảo vệ 100% dữ liệu (chat, tài liệu, kết nối AI) vào kho lưu trữ riêng của User đó, đồng thời làm sạch toàn bộ bộ nhớ tạm trên màn hình. Đảm bảo khi 2 người dùng xài chung 1 máy, tài khoản nào đăng nhập chỉ truy cập đúng dữ liệu riêng của mình, không bị rò rỉ hay dính dáng tới tài khoản khác.

## [1.0.35] - 2026-07-22
### UI & Design Polish
*   Tái thiết kế toàn bộ khu vực **AI Router Connections** trong Settings thành dạng Block Card siêu sang trọng, phân tách rõ ràng dòng thông tin tài khoản, thông báo lỗi (Error container) và thanh công cụ thao tác Test / Renew / Reset phía dưới, giải quyết triệt để lỗi chồng lấp nút bấm.

## [1.0.34] - 2026-07-22
### Security & Auth Lock
*   Siết chặt logic Auth Lock: Khi người dùng bấm **Log out** hoặc chưa đăng nhập `user` local, ứng dụng lập tức thoát ra ngoài và hiển thị màn hình Onboarding / Đăng nhập, đồng thời vô hiệu hóa hoàn toàn ô nhập liệu Chat cho tới khi người dùng Đăng nhập lại.

## [1.0.33] - 2026-07-22
### Added & Improved
*   Nâng cấp **Media Gallery**: Gom toàn bộ hình ảnh đính kèm từ tất cả các phiên chat (`chatSessions`) vào bộ sưu tập, bổ sung nhãn badge `💬 [Tên phiên chat]` trên từng card và nút **Go Direct to Chat Conversation** giúp nhảy thẳng tới đoạn chat tương ứng.

## [1.0.32] - 2026-07-22
### Fixed & Improved
*   Sửa dứt điểm lỗi đính kèm hình ảnh rơi vào icon fallback: Xử lý tệp hình ảnh không có văn bản đọc được trong `indexKnowledgeFile` mà không throw lỗi, lưu trực tiếp Base64 Data URL vào IndexedDB và `ChatMessage.attachments`, đảm bảo hiển thị 100% hình ảnh thu nhỏ căng nét rạng rỡ.

## [1.0.31] - 2026-07-22
### Added & Improved
*   Xây dựng giao diện **Media Gallery** nghệ thuật (phong cách Midjourney/Pinterest) với hàng Featured Templates carousel và lưới Masonry Gallery tự điều chỉnh tỷ lệ khung hình cho tất cả media assets trong ứng dụng.
*   Bổ sung thanh Floating Imagine / Filter Bar phía dưới với các chip tương tác Image, Video, Agent, Speed, Aspect Ratio.

## [1.0.30] - 2026-07-22
### Fixed & Improved
*   Kích hoạt tính năng Clickable và Direct Link mở trực tiếp trình duyệt mặc định (Chrome/Safari) trên cả khung tin nhắn chat lẫn tab Link của Side Panel "Shared Media & Files" thông qua Rust native `open_external` command.

## [1.0.29] - 2026-07-22
### Fixed & Improved
*   Tích hợp component `InlineAttachmentPreview` tự động truy xuất Base64 Data URL từ IndexedDB, đảm bảo hiển thị trực tiếp bức ảnh thu nhỏ (Inline Image Thumbnail) trên bong bóng chat ngay cả khi ứng dụng bị reload hoặc khi mở lại lịch sử các phiên chat cũ.

## [1.0.28] - 2026-07-22
### Added & Improved
*   Hiển thị trực tiếp ảnh thu nhỏ (Inline Image Preview Thumbnail) ngay trong bong bóng tin nhắn chat chuẩn phong cách WhatsApp / Telegram, nhấp vào để xem ảnh phóng to full HD.
*   Bổ sung nút **Renew** (Renew/Refresh OAuth Token) trực tiếp trên trang Settings. Cho phép làm mới access token khi bị hết hạn mà không cần Reset hay đăng nhập lại từ đầu.
*   Hỗ trợ Paste hình ảnh & tệp đính kèm trực tiếp từ Clipboard (`Cmd+V`) vào ô chat composer.
*   Tích hợp Side Panel "Shared Media & Files" lọc theo 3 tab (Media / Link / Docs) bên cạnh phải trang Chat.
*   Bổ sung thanh Tìm kiếm Lịch sử Chat (Search Chat History) trên Header trang Chat.
*   Sửa dứt điểm lỗi đính kèm file còn sót lại trên thanh chat composer sau khi gửi (tự động xóa sạch đính kèm sau khi bấm Send/Enter, không bị gửi lặp lại khi reload).
*   Lưu Data URL (Base64) của tệp hình ảnh vào IndexedDB, cho phép mở Modal Preview ảnh gốc sắc nét 100% giống Codex/Gemini/Claude.

## [1.0.27] - 2026-07-21
### Added
*   Nâng cấp giao diện bong bóng chat (Chat bubbles) theo phong cách Telegram/Whatsapp cao cấp với bo góc bất đối xứng, bổ sung avatar Agent ở cạnh và hiển thị thời gian kèm check đôi ✓✓.
*   Khắc phục lỗi không thể Copy/Paste (Cmd+C / Cmd+V) trên macOS bằng cách kích hoạt menu feature của Tauri và tích hợp Edit Menu Submenu vào mã Rust Core.

## [1.0.26] - 2026-07-21
### Added
*   Hỗ trợ gửi tin nhắn chat trực tiếp chỉ với file đính kèm (cho phép nhấn Enter hoặc Send khi ô nhập text trống).
*   Tự động ẩn file đính kèm khỏi thanh input chat sau khi tin nhắn đã được gửi đi thành công.
*   Tích hợp tính năng xem trước (Preview) hình ảnh gốc của các tệp ảnh vừa upload, và xem trước nội dung văn bản trích xuất của tất cả các tài liệu (PDF, Word, Excel, Markdown...) trong cả tab Chat và tab Knowledge.

## [1.0.25] - 2026-07-21
### Added
*   Triển khai giao diện Quản lý lịch sử chạy (Task Logs) cho Scheduled Tasks dạng Console-style trực quan, hỗ trợ tự sinh mock logs mẫu để kiểm thử cục bộ.
*   Bổ sung nút Phóng to (Maximize/Minimize) cho Dialog cấu hình Agent trên UI, chuyển sang giao diện 2 cột thông minh giúp nâng tầm trải nghiệm viết Prompt dài.
*   Hỗ trợ tải lên file hình ảnh (PNG, JPG, WebP...) trực tiếp hoặc thông qua file nén ZIP vào RAG Knowledge Base bằng cách trích xuất tự động siêu dữ liệu (metadata) của ảnh.

### Fixed
*   Pack editor expansion now opens in a dedicated modal surface with a
    backdrop instead of being clipped inside the model dropdown. Pack routing
    uses visible Fallback and Round robin controls rather than a native select.
*   Antigravity OAuth no longer sends Tauri's internal WebView origin to
    Google. It uses the registered local callback (`localhost:1420`) and
    presents the explicit callback paste step after browser approval.
*   OpenAI Codex subscription sign-in now routes the fixed OAuth relay back to
    the local manual callback instead of rejecting Tauri's internal origin.
    A late browser callback now expires safely without crashing the AI Router.
*   Chat now removes provider `<think>`/`<thinking>` reasoning blocks, including
    unfinished streamed blocks, before they reach the conversation. Basic
    Markdown headings, bold text, inline code and lists render as chat content.
*   Local User account status now recognizes the legacy Gemini, ChatGPT and
    Grok provider identifiers used during onboarding. Logging out cancels an
    in-flight sign-in attempt, clears its UI state, and leaves sign-in buttons
    ready for the next account.
*   Release now keeps matrix artifacts in a draft until both macOS builds finish,
    then publishes once. This prevents Intel artifacts from being blocked by an
    already-published immutable release.
*   Desktop WebView origins (`tauri.localhost` and `tauri://localhost`) are
    accepted by AI Router CORS so the onboarding can load its provider catalog.
*   Successful main releases are now published automatically; the Tauri Action
    asset naming input uses its supported `assetNamePattern` option.
*   The inherited `open-sse` Provider Core is resolved directly from its
    single bundled source tree, avoiding an npm-copied duplicate with broken
    internal paths in the desktop application.
*   macOS release artifacts bundle both Node and npm-locked AI Router runtime
    dependencies (`undici`, `uuid`, `node-machine-id`), then verify them inside
    the final `.app`. Tauri's `_up_` resource layout is resolved and sidecar
    startup failures land in the app runtime log with their actual cause.
*   Gemini and Claude desktop callback completion delegates token exchange and
    Antigravity setup to the native AI Router Core, avoiding WebView `Load
    failed` errors from direct provider requests.
*   Packaged desktop runtime resolves its bundled AI Router/Agent Runner from
    Tauri resources. The About view receives the build manifest version.
*   Desktop first sign-in now uses an explicit callback URL/authorization-code
    completion screen and enters Chat after the exchange succeeds. This avoids
    losing a fast browser callback before the Tauri webview subscribes.

## [1.0.1] - 2026-07-19
### Added
*   Chuyển phần kết nối model sang **AI Router native**: Provider Core được
    vendor vào repository và chạy local sidecar, kế thừa registry/adapter của
    upstream thay vì tạo adapter riêng cho từng vendor.
*   Bổ sung mô hình multi-account cho AI Router: một provider có thể có nhiều
    connection, mỗi connection có account label/email, priority và
    `credentialRef` riêng.
*   Bổ sung Model Packs (fallback/round-robin), account filter và model source
    metadata cho bộ chọn model.

### Changed
*   Vault trở thành boundary bắt buộc của AI Router: UI, agent và connector chỉ
    xử lý reference/metadata; sidecar mới resolve secret vào lúc thực thi.
*   Local User là profile thiết bị tạo từ lần AI sign-in đầu tiên. Logout gỡ
    profile và connection tạo profile, nhưng không xoá các vendor độc lập.
*   Pipeline release macOS chạy sau commit `main`, tự tăng patch từ tag gần
    nhất và tạo artifact Intel/Apple Silicon trước các nền tảng khác.

### Fixed
*   Tách trạng thái Local User account khỏi toàn bộ danh sách AI Router
    connections để tránh báo "connected" sai.
*   Giữ credential đã OAuth thành công khi model test thất bại do quota hoặc
    permission upstream.

## [1.2.0] - 2026-07-12
### Added
*   Đặc tả kiến trúc **Độc lập SDK (Universal Agent Loop)** loại bỏ hoàn toàn sự phụ thuộc vào `@anthropic-ai/claude-agent-sdk` và hỗ trợ đa nhà cung cấp (ChatGPT, Claude, Gemini, OpenRouter, LocalAI) trên cả 3 nền tảng macOS, Windows, Linux.
*   Thiết kế luồng cấu hình Agent bằng các file Markdown riêng biệt tương tự như Paperclip configuration.
*   Làm rõ vai trò của **Vault** làm module bảo mật mặc định (không phải connector) và các **Integrations/Connectors** kết nối vào Vault lấy credential an toàn.
*   Bổ sung đặc tả luồng chào mừng (Onboarding welcome screen) tự động bỏ qua sau khi đã đăng nhập lần đầu tiên thành công.
*   Thiết lập nền tảng cấu hình Tauri Launcher trong `runtime.rs` và `lib.rs` để tự khởi chạy NanoClaw nhúng dưới dạng Host Process.
