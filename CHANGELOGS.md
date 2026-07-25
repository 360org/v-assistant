# CHANGELOGS: Nhật ký Phát triển V-Assistant (Zero-Docker / Đa nền tảng)

Nhật ký ghi lại các cột mốc thay đổi kiến trúc và tái cấu trúc hệ thống.

## [Unreleased]
### Interactive 1-Click Permission Approval & Absolute Host Workspace Access
*   **Thẻ Phê Duyệt Quyền Truy Cập 1-Click (Permission Approval Card)**:
    - Khi Agent phát hiện hoặc yêu cầu thao tác trên đường dẫn tệp/thư mục nằm ngoài phạm vi mặc định (hoặc trên máy host), giao diện Chat tự động hiển thị **Thẻ Xin Quyền Trực Quan** kèm đường dẫn và nút bấm **[ Cho phép (Approve) ]** / **[ Từ chối (Deny) ]**.
    - Cho phép người dùng nhấp **[ Cho phép (Approve) ]** 1-Click ngay trong khung Chat để tự động cấp quyền và thực thi công việc ngay lập tức mà không phải vào Cài đặt thủ công.
*   **Hỗ trợ đường dẫn tuyệt đối cho Native Tools (`agent-runner`)**:
    - Chuẩn hóa hàm `workspacePath` trong `agent-runner/src/native-tools/index.ts`, hỗ trợ đọc các đường dẫn tuyệt đối trên máy chủ (`/Volumes/DATA/...`) khi được người dùng phê duyệt.
    - Cập nhật script `build` trong `package.json` tự động biên dịch `agent-runner` (`npx tsc --project agent-runner/tsconfig.json`) đồng bộ vào gói đóng gói ứng dụng.
*   **Robust PDF Extraction & Image-based PDF Fallback**:
    - Bọc an toàn `extractPdf` chống lỗi Web Worker trong môi trường Tauri WebView; tự động fallback đăng ký tài liệu dạng PDF Asset đối với tệp PDF dạng ảnh quét (Delivery Slip, Hóa đơn) giúp tệp hiển thị trạng thái `Ready` tức thì.
*   **Giao diện Sidebar Profile 2 dòng**:
    - Tách biệt tên người dùng, thẻ Badge `v1.1.0` (Emerald) và dòng thương hiệu `Powered by VuaAI.net` thành 2 dòng riêng biệt, chống tràn/cắt chữ.

## [1.1.0] - 2026-07-25
### Comprehensive System Hardening, Multimodal Vision & Production Release
*   **Multimodal Image Vision Engine for ALL AI Vendors**:
    - Hỗ trợ đọc & phân tích hình ảnh đính kèm (`attachments`) cho tất cả các nhà cung cấp AI (Google Antigravity, Gemini, ChatGPT, Claude, OpenRouter).
    - Tự động chuẩn hóa định dạng hình ảnh phù hợp theo chuẩn Vision API của từng Vendor (`inlineData`, `image_url`, `base64`).
*   **System Stability & macOS Not Responding Fix**:
    - Chuyển đổi toàn bộ Tauri IPC Handlers (`execute_cli_command`, `vault_set`, `vault_get`, `vault_delete`) sang `async fn` chạy trên Tokio Worker Thread Pool, loại bỏ 100% tình trạng `Not Responding` freeze ứng dụng trên macOS.
    - Tích hợp 30s CLI hard timeout tự động ngắt các lệnh treo hoặc vòng lặp vô hạn.
    - Xử lý giải phóng cổng AI Router Sidecar (`kill_stale_port_process`) triệt tiêu lỗi `EADDRINUSE 20128`.
*   **Agent Runner Hardening & Audit Logging**:
    - Ngắt vòng lặp restart lặp vô hạn của Agent Runner (`consecutive_failures >= 5`), tích hợp đọc log stderr thực tế từ `runner.log`.
    - Ghi vết truy vết cấu trúc JSON cho toàn bộ Native Tools vào `~/.v-assistant/data/workspace/<agent_id>/.audit/tool_calls.log`.
*   **OAuth Security & Custom Data Directory Sync**:
    - Tự động lưu trữ `refresh_token` và `expiresAt` cho Claude OAuth vào Vault mã hóa; tự động refresh token bằng `refreshClaudeToken()`.
    - Đồng bộ khóa `vua:custom-data-path` trong `localStorage` và Vault, giúp các module đính kèm (`knowledge.ts`, `tools.ts`) lưu chính xác vào thư mục tùy chỉnh của người dùng.
    - Debounce 500ms cho việc lưu state và tệp backup đĩa trong `store.tsx`, tối ưu hiệu năng nhập liệu chat.
*   **AI Router & Model Catalog**:
    - Cập nhật mô hình Gemini 3.6 Flash & Gemini 3.5 Flash (High/Medium/Low) vào AI Router Registry và UI Pickers.
    - Cập nhật runner CI/CD GitHub Actions (`macos-13`) tự động đóng gói ứng dụng mượt mà cho cả macOS Intel & Apple Silicon.


## [1.0.75] - 2026-07-24
### GitHub Actions Production Release Runner Fix
*   **Fix GitHub macOS Runner (`release.yml`)**: Đổi tên runner `macos-15-intel` không hợp lệ thành `macos-13` (runner x86_64 chuẩn của GitHub), bổ sung cờ `--force` khi push tag giải quyết triệt để xung đột tag release.

## [1.0.74] - 2026-07-24
### GitHub Actions CI Alignment
*   **Fix CI Test Assertion (`login-check.mjs`)**: Cập nhật danh sách kiểm thử tự động `MODELS.gemini` trong kịch bản CI phù hợp với danh sách danh mục Gemini 3.6 mới (`gemini-3.6-flash-high`, `gemini-3.6-flash-medium`, `gemini-3.6-flash-low`), giúp tất cả các luồng CI & Release trên GitHub Actions vượt qua 100% xanh lá.

## [1.0.73] - 2026-07-24
### Unified Physical Disk Data Storage Architecture
*   **Tự động lưu tệp vật lý vào data directory (`uploads/`)**: Toàn bộ tệp tải lên (hình ảnh, tài liệu, tệp đính kèm trò chuyện, Media Vault, Knowledge Base) đều được lưu trữ trực tiếp thành tệp vật lý trong thư mục `uploads/` của Data Directory (cho cả vị trí mặc định `~/.v-assistant/data` và vị trí mount tùy chỉnh).
*   **Automatic Backup & Sync**: Tự động giải quyết đường dẫn hệ thống (`resolve_data_dir`) hỗ trợ dấu `~/` trên macOS/Linux, tự động xả và đồng bộ tất cả tệp dữ liệu đã tải lên từ trước vào thư mục `uploads/` thực tế trên đĩa cứng ngay khi khởi động ứng dụng.

## [1.0.72] - 2026-07-24
### Agent Markdown Spec Docs, Fast Sign-in Auto-Scroll & Row 2 Vertical Layout
*   **Agent Markdown Spec Documents (.md)**: Bổ sung khu vực đính kèm & quản lý file đặc tả Markdown Specs trong Agent Modal (`Agents.tsx`), hỗ trợ đầy đủ 11 file tiêu chuẩn Paperclip / 360 CORP (`SOUL.md`, `MISSION.md`, `NORTH_STAR.md`, `HEARTBEAT.md`, `PRINCIPLES.md`, `VALUES.md`, `THINKING.md`, `DECISION.md`, `GOVERNANCE.md`, `PLAYBOOK.md`, `MANIFESTO.md`) cùng tính năng tạo file `.md` tùy chỉnh.
*   **Fast Sign-in Auto-Scroll UX**: Tự động cuộn trang mượt mà (`smooth-scroll`) tới vị trí khung đăng nhập OAuth / Callback URL ngay khi người dùng bấm nút Fast Sign-in, xóa bỏ hoàn toàn rào cản ẩn khuất dưới màn hình.
*   **Row 2 Vertical Stack Layout**: Tách Row 2 (Fast Sign-in) trong Settings Card thành 2 hàng riêng biệt (Tiêu đề phía trên, 4 nút Vendor ở hàng dưới), chống vỡ tràn chữ tuyệt đối.

## [1.0.71] - 2026-07-24
### Agent Markdown Specs & Fast Sign-in Smooth Auto-Scroll
*   **Agent Markdown Spec Documents (.md)**: Bổ sung khu vực quản lý file đặc tả Markdown Specs trong Agent Modal (`Agents.tsx`), hỗ trợ sẵn 11 file chuẩn Paperclip / 360 CORP (`SOUL.md`, `MISSION.md`, `NORTH_STAR.md`, `HEARTBEAT.md`, `PRINCIPLES.md`, `VALUES.md`, `THINKING.md`, `DECISION.md`, `GOVERNANCE.md`, `PLAYBOOK.md`, `MANIFESTO.md`) cùng tùy chọn đính kèm file `.md` tùy chỉnh.
*   **Fast Sign-in Smooth Auto-Scroll**: Tự động cuộn trang mượt mà (`smooth-scroll`) xuống đúng khung kết nối AI Vendor khi bấm nút Fast Sign-in, không còn bị ẩn khuất dưới màn hình làm người dùng bối rối.
*   **Row 2 Multi-line Layout**: Chuyển Row 2 (Fast Sign-in) trong Settings Card thành 2 hàng dọc (Tiêu đề ở trên, 4 nút Vendor ở dưới) chống đè tràn chữ trên mọi kích thước màn hình.

## [1.0.70] - 2026-07-24
### Pixel-Perfect Account & Preferences Mockup Design
*   **Exact Mockup Layout**: Tái thiết kế toàn bộ khu vực **Tài khoản & Thiết lập (Account & Preferences)** khớp chính xác 100% bản vẽ Mockup người dùng yêu cầu:
    *   Thanh chỉ báo màu xanh dương nổi bật (`|`) ở tiêu đề nhóm.
    *   Hồ sơ cá nhân với Avatar 3 lớp có vòng sáng phát quang gradient xanh cyan/blue và viền ánh kim.
    *   Icon hộp vuông màu xanh đậm (`Zap`, `Globe`, `Palette`) định danh cho từng hàng tùy chọn.
    *   Phân tách từng dòng mượt mà bằng đường vạch mờ `divide-neutral-800/70`.
    *   Nút Fast Sign-in gắn logo Vendor chuẩn, nút Đăng xuất chữ đỏ viền đỏ sang trọng.

## [1.0.69] - 2026-07-24
### Perfect Proportioned Sidebar Banner Height
*   **Optimal Banner Height (~175px)**: Bổ sung hiển thị danh sách 3 tính năng nổi bật (`features`) với icon tích xanh `CheckCircle2` trong `SidebarAdBanner.tsx`. Chiều cao của Banner đạt chuẩn ~175px vừa khít hoàn hảo như khung hình ảnh 2, giàu thông tin và thẩm mỹ cao.

## [1.0.68] - 2026-07-24
### Isolated Fast Sign-in Button Loaders
*   **Isolated Button Spinners**: Sửa triệt để lỗi 4 nút Fast Sign-in đồng loạt quay spinner khi click vào 1 nút. Giờ đây chỉ đúng 1 nút AI Account được người dùng bấm chọn mới hiển thị spinner xoay tròn (`fastSignInAccountId`), 3 nút còn lại giữ nguyên icon Đăng nhập tĩnh.

## [1.0.67] - 2026-07-24
### Compact Sidebar Banner & Unified Settings Card
*   **Fixed Sidebar Banner Height**: Loại bỏ `flex-1` và `min-h-[220px]` trong `Sidebar.tsx`, đưa Banner về chiều cao siêu gọn tự nhiên (~110px) ôm sát nội dung thay vì giãn khoảng trống đen cồng kềnh.
*   **Single Unified Settings Card**: Gộp toàn bộ Tài khoản & Thiết lập vào duy nhất 1 Group Card duy nhất khoa học và thẩm mỹ.
*   **Persistent Model Packs**: Tự động lưu trữ và đồng bộ khôi phục Custom Model Packs từ App Vault.

## [1.0.66] - 2026-07-24
### Refactored Settings Layout & Card Separations
*   **Scientific Section Separation**: Tách rời **Tài khoản ứng dụng (Account Profile)** và **Tùy chỉnh ứng dụng (Preferences)** thành 2 Card riêng biệt độc lập.
*   **Enhanced Hierarchy & Spacing**: Thêm icon bảo mật mã hóa App Vault, tổ chức lại nút Đổi tên / Đăng xuất, tách biệt khu vực Đăng nhập nhanh AI Accounts và bộ đôi tùy biến Ngôn ngữ & Chủ đề giao diện.

## [1.0.65] - 2026-07-24
### Compact Sidebar Ad Banner Layout
*   **Ultra-Compact Sidebar Ad Banner**: Thu gọn kích thước banner quảng cáo `VUA AI — 360 CORP` ở Sidebar trái, bỏ box 3 dòng bullet points cồng kềnh, giảm chiều cao tối thiểu từ `240px` xuống `135px`.
*   **Optimal Proportion**: Banner vừa vặn, tinh tế, không làm chiếm diện tích danh mục Sidebar.

## [1.0.64] - 2026-07-24
### Integrated Theme & Language into Account Profile Card
*   **Unified Account & Preferences Hub**: Nhúng trực tiếp cài đặt **Ngôn ngữ hiển thị** (`Tiếng Việt / English`) và **Chủ đề giao diện** (`Dark Emerald / Warm Gold / Midnight Blue`) vào bên trong **Account Profile Card**.
*   **Clean Layout**: Xóa bỏ section `Giao diện & Ngôn ngữ` đứng riêng lẻ giúp giao diện Settings gọn gàng, liền mạch và chuẩn UX.

## [1.0.63] - 2026-07-24
### Isolated Action Button Spinner States
*   **Specific Action Keying**: Chuyển đổi trạng thái `connectionActionId` thành `connectionActionKey` kèm theo action prefix (`test:`, `renew:`, `toggle:`, `reset:`).
*   **Single Spinner Execution**: Khi người dùng nhấn nút **Test**, chỉ DUY NHẤT nút **Test** mới hiển thị icon xoay loading `LoaderCircle`, các nút bên cạnh (`Tắt`, `Renew`, `Reset`) giữ nguyên icon gốc của mình giúp giao diện chuyên nghiệp và không bị nhầm lẫn.

## [1.0.62] - 2026-07-24
### Independent Local User Profile Persistence
*   **Local User Profile Protection**: Sửa hàm `ensureLocalUser` trong `src/lib/store.tsx` để bảo vệ thông tin Local Profile đã khởi tạo ban đầu.
*   **Vendor Connection Isolation**: Khi kết nối hoặc đăng nhập bất kỳ vendor mới nào (Grok, OpenAI, Gemini, v.v.), hệ thống chỉ thêm connection vào AI Router vault mà **KHÔNG ĐƯỢC THAY ĐỔI / GHI ĐÈ** thông tin Local User profile (Name, Detail, Avatar) của ứng dụng.

## [1.0.61] - 2026-07-24
### Collapsible Messages for Disabled AI Providers
*   **Default Hidden Message Box**: Các box thông báo màu vàng (`⏸️ Provider đang TẮT`) và box lỗi màu đỏ (`Sign-in expired...`) ở mục **Provider Đã Tắt** mặc định được **ẨN đi**, giúp mỗi hàng provider cực kỳ gọn gàng (chỉ 1 dòng).
*   **Toggle View Message**: Thêm nút **`[ ℹ️ Xem tin / Ẩn tin ]`** cho từng provider đã tắt. Khi người dùng cần xem nguyên nhân hoặc thông báo lỗi, chỉ cần nhấp nút để mở chi tiết.

## [1.0.60] - 2026-07-24
### Improved Vendor Config Box Position in Provider Manager
*   **Optimal Config Box Position**: Khung cấu hình Vendor được chọn (`selectedProvider`) được di chuyển lên nằm **ngay phía dưới ô Search**, trước danh sách vendor.
*   **UX Friendly**: Người dùng không cần phải cuộn xuống tận cuối danh sách 50+ vendor nữa; form đăng nhập/API key xuất hiện ngay lập tức ở tầm mắt khi chọn vendor.

## [1.0.59] - 2026-07-24
### Active Cards & Disabled ListView Hybrid Layout for AI Router
*   **Active Cards Grid**: Các AI Provider đang hoạt động (`Active / Verified`) được giữ nguyên dưới dạng Card 2 cột to đẹp, nổi bật phía trên.
*   **Disabled ListView Section**: Các AI Provider đã bị **Tắt** (`isActive === false`) tự động tách thành một danh sách ListView tinh gọn bên dưới (`Provider Đã Tắt / Hết Token`), giúp giao diện cực kỳ ngăn nắp.

## [1.0.58] - 2026-07-24
### Converted AI Router Provider Cards to Compact ListView
*   **Compact ListView Layout**: Chuyển đổi giao diện danh sách AI Provider tại trang **Settings** từ dạng Grid 2 cột sang dạng **ListView** dọc tinh gọn.
*   **Enhanced UX**: Hiển thị tên, email/account, status badge bên trái và thanh nút thao tác nhanh (`[⚡ Bật/Tắt]`, `[🧪 Test]`, `[🔄 Renew]`, `[🗑️ Reset]`) ngang hàng bên phải.

## [1.0.57] - 2026-07-24
### Active-First Provider Sorting in AI Router List
*   **Automatic Sort Order**: Danh sách AI Router Provider tại trang **Settings** và API backend tự động ưu tiên đẩy tất cả các Provider đang hoạt động lên trên cùng.
*   **Push Disabled to Bottom**: Các Provider đã bấm **Tắt** (`isActive === false`) tự động bị đẩy xuống cuối danh sách, giúp giao diện gọn gàng và ưu tiên các tài khoản active.

## [1.0.56] - 2026-07-24
### Fixed ReferenceError in AI Router Toggle Endpoint
*   **Fix Toggle Connection Endpoint**: Sửa lỗi gọi sai tên hàm `readConnection(id)` thành `findConnection(id)` trong route handler `POST /v1/providers/:id/toggle` của AI Router sidecar.
*   **Smooth Provider Toggling**: Nút **Tắt / Bật lại** Provider hoạt động trơn tru 100%, không còn bị crash sidecar hay bắn ra lỗi `readConnection is not defined`.

## [1.0.55] - 2026-07-24
### Allowed All Local & Tauri WebView Origins for AI Router Sidecar
*   **Flexible CORS for Tauri Origins**: Hỗ trợ đầy đủ và linh hoạt các origin local của Tauri Desktop WebView (`http://tauri.localhost`, `tauri://localhost`, `http://vassistant.localhost`, `http://localhost:*`, `127.0.0.1`, `app://`).
*   **Fix `AI Router unavailable: Load failed`**: Giải quyết triệt để lỗi chặn CORS giữa WebKit desktop webview và sidecar HTTP service (`:20128`).

## [1.0.54] - 2026-07-24
### Cleaned Hardcoded Sample Templates from Media Gallery
*   **User Media Exclusive**: Loại bỏ hoàn toàn mớ ảnh mẫu/stock template thừa (`Featured Templates` & Unsplash stock items).
*   **Clean Vault Layout**: Trang **Media Gallery** giờ đây hiển thị duy nhất tệp hình ảnh & phương tiện do chính người dùng hoặc AI Agent tải lên/gửi qua Chat (và Knowledge). Tích hợp giao diện Empty State sạch sẽ khi chưa có phương tiện nào.

## [1.0.53] - 2026-07-24
### Auto-Retry & Resilient Banner for AI Router Sidecar Connection
*   **Startup Auto-Retry**: Thêm cơ chế tự động thử lại 3 lần (350ms delay) khi khởi động sidecar AI Router, loại bỏ triệt để lỗi chập chờn `AI Router unavailable: Load failed`.
*   **Resilient Error Banner**: Không còn ẩn danh sách các card AI Provider khi gặp sự cố mạng tạm thời. Hiển thị banner thông báo kèm nút **`[ 🔄 Thử lại ]`** 1-click để kết nối lại tức thì mà không cần khởi động lại app.

## [1.0.52] - 2026-07-24
### Added Enable/Disable Toggle Option for AI Providers (Hạn mức & Token Limit Pause)
*   **AI Provider Toggle Switch**: Bổ sung nút **Tắt / Bật lại** trực tiếp trên từng card AI Router Connection tại trang **Settings**.
*   **Token Exceeded Pause Mode**: Khi tài khoản AI Provider hết hạn mức/token hoặc bị rate-limit chờ reset, người dùng có thể nhấp **Tắt** (`PowerOff`). AI Router sẽ tạm thời ẩn và bỏ qua tất cả mô hình thuộc nhà cung cấp đó khỏi hệ thống Chat. Người dùng có thể nhấp **Bật lại** (`Power`) bất kỳ lúc nào khi hạn mức khôi phục!

## [1.0.51] - 2026-07-24
### Standardized Official App Protocol & Origin to vassistant.localhost
*   **Enforced Single Origin Rule**: Loại bỏ hoàn toàn tất cả các domain/origin cũ `tauri.localhost` và `tauri://localhost` trong AI Router sidecar & cấu hình ứng dụng.
*   **Strict Standard Protocol**: Đơn nhất 1 origin duy nhất chuẩn hóa toàn hệ thống: `http://vassistant.localhost` (`customProtocol: vassistant`).

## [1.0.50] - 2026-07-24
### Restored Full Agent Response Text Display
*   **Full Response Content Render**: Sửa dứt điểm lỗi ẩn câu trả lời của Agent hoặc thay thế câu trả lời thực tế bằng nhãn tĩnh. Toàn bộ nội dung văn bản, bảng biểu, danh sách và suy luận `<think>` từ Agent đều được hiển thị đầy đủ 100%.
*   **Reasoning Extraction**: Tự động hiển thị phần suy luận suy nghĩ `💭 Suy luận Agent` nếu mô hình AI sử dụng định dạng `<think>...` thay vì nuốt mất chuỗi nội dung.

## [1.0.49] - 2026-07-24
### Fixed Continuous Blinking of Legacy Task Messages in Chat History
*   **Legacy Message Status Fix**: Khắc phục triệt để lỗi bong bóng tin nhắn cũ trong lịch sử chat bị nhấp nháy đèn báo `⏳ Tác vụ đang chờ thực thi...` liên tục.
*   **Active Message Scoping**: Đèn báo hiệu ứng `animate-ping` & `animate-pulse` chỉ xuất hiện duy nhất cho tin nhắn ĐANG thực thi ở thời điểm hiện tại. Các tin nhắn đã xử lý xong trong lịch sử được chuyển về trạng thái tĩnh `✅ Tác vụ đã hoàn tất` sạch sẽ, không gây mất tập trung.

## [1.0.48] - 2026-07-24
### Added Sidebar Version Update Notification Badge
*   **Sidebar Version Update Badge**: Thêm badge thông báo phiên bản mới nhấp nháy phát sáng (`vX.Y.Z`) trực tiếp trên mục menu **Settings** ở Sidebar trái. Tự động kiểm tra GitHub Releases mỗi khi có bản phát hành mới để báo cho người dùng nhấp vào Cài đặt để cập nhật 1-click.

## [1.0.47] - 2026-07-24
### Added Expand / Maximize Multi-line Editor for Chat Composer
*   **Expand / Maximize Multi-line Editor**: Thêm nút biểu tượng Phóng to / Thu nhỏ (`Maximize2` / `Minimize2`) trực tiếp trên ô nhập liệu Chat Input Box.
*   **Multi-line Code Editor Mode**: Khi bấm mở rộng, ô nhập liệu sẽ tự động giãn chiều cao rộng rãi (`h-64 sm:h-80`) kèm thanh công cụ hiển thị số dòng, số ký tự theo thời gian thực (`X dòng · Y ký tự`), giúp người dùng thoải mái gõ và chỉnh sửa các đoạn văn bản dài, prompt phức tạp hoặc mã nguồn nhiều dòng.

## [1.0.46] - 2026-07-24
### Refined Drag & Drop Scope to Input Box Only
*   **Input Box Drag & Drop Scoping**: Tinh chỉnh lại khu vực Kéo & Thả (Drag & Drop): Thu gọn phạm vi thả tệp/thư mục và hiệu ứng overlay thông báo vừa vặn duy nhất trong khung nhập liệu Chat Input Box (không phủ mờ toàn bộ màn hình Chat), mang lại trải nghiệm tinh tế và chuẩn xác cho người dùng.

## [1.0.45] - 2026-07-24
### Added GitHub Auto-Updater, Drag & Drop Folders/Files & Smart Task Status Widget
*   **GitHub Releases Auto-Updater**: Thêm cơ chế tự động kiểm tra phiên bản mới từ GitHub Releases (`360org/v-assistant`). Hiển thị thông báo nổi bật tại màn hình Settings kèm Release Notes và nút tải tự động `.dmg` 1-click.
*   **Drag & Drop Folders and Files**: Hỗ trợ kéo thả trực tiếp Thư mục (Folder) và Tệp tin từ macOS Finder vào khung Chat. Tự động nhận diện đường dẫn tuyệt đối của thư mục và tự điền cấu hình yêu cầu làm việc cho Agent.
*   **Smart Background Task Widget & Status**: Lọc và chỉ hiển thị Widget "1 task running" cho các tiến trình chạy ngầm đa nhiệm (build image, async runner). Khắc phục triệt để lỗi bong bóng chat bị rỗng khi task chưa thực thi.

## [1.0.44] - 2026-07-23
### Added Step-by-Step Wizard, Realtime Status, Theme/Language & Data Export/Import
*   **Step-by-Step Connector Wizard**: Tích hợp Interactive Wizard 3 bước cho trang Integrations hướng dẫn từng bước chuẩn bị credentials, nhập thông tin và kiểm tra kết nối.
*   **Realtime Connection Status**: Thêm cơ chế tự động hiển thị mốc thời gian xác thực realtime (`🟢 Verified at HH:MM`) cho tất cả Integrations & Plugins.
*   **Theme & Language Settings**: Thêm tính năng chọn ngôn ngữ giao diện (Tiếng Việt 🇻🇳 / English 🇬🇧) và 3 chủ đề màu sắc sang trọng (Dark Emerald, Warm Gold, Midnight Blue) trong trang Settings.
*   **Full Data Export & Restore**: Thêm tính năng Xuất dữ liệu sao lưu toàn bộ (.json) và Khôi phục dữ liệu từ tệp sao lưu (.json) cho lịch sử Chat, Kỹ năng, Lịch đăng bài và cấu hình Vault.

## [1.0.43] - 2026-07-23
### Fixed Host File Saving & Anti-collision for Clipboard Pastes
*   **Host Data File Storage Fix**: Khắc phục hiện tượng ảnh dán từ Clipboard (macOS mặc định đặt tên `image.png`) bị ghi đè lẫn nhau bằng cơ chế tự động đánh số timestamp chống trùng tên (`image_17848012.png`).
*   **Data Path Fallback**: Đảm bảo toàn bộ hình ảnh tải lên hoặc dán trong Chat và Media Gallery đều nạp đúng `customDataPath` từ state và `localStorage` để tự động sao lưu vào thư mục `uploads/` trên đĩa cứng.

## [1.0.42] - 2026-07-23
### Fixed Media Gallery Image Preview
*   **Media Gallery Persistent Image Fix**: Nâng cấp toàn bộ trang Media Gallery (bao gồm danh sách ảnh Discover Media Vault và Lightbox Preview Modal) hỗ trợ nạp fallback qua Tauri Asset Protocol (`convertFileSrc`) từ thư mục host `customDataPath/uploads/` và hiển thị thẻ placeholder sắc nét khi dữ liệu hình ảnh cũ bị xóa, ngăn chặn triệt để biểu tượng lỗi `[?]`.

## [1.0.41] - 2026-07-23
### Added Skill Creator & Host Execution Tools & Skill Enable Enforcement
*   **Skill Creator Spec-Driven Integration**: Tích hợp công cụ Skill Creator tự động thiết kế và tạo kỹ năng Agent chuẩn Agent Skills spec (Claude standard). Bổ sung tool `create_skill` tự động ghi file `SKILL.md` và đăng ký skill vào hệ thống.
*   **Host System Execution Tools**: Tích hợp bộ công cụ thực thi trực tiếp trên máy host (`web_search`, `file_read`, `file_write`, `file_list`, `mcp_status`).
*   **Skill Enablement Rule Enforcement**: Bổ sung quy tắc quản lý Kỹ năng: Chỉ các Kỹ năng được **Bật/Cài đặt (Enable/Install)** trong trang Skills mới được phép hiển thị và gọi ra sử dụng trong Chat (qua gõ lệnh `/`, Menu chọn skill Header và Nút Wand composer).
*   **Persistent Image Attachment & Fallback**: Khắc phục dứt điểm sự cố hình ảnh đính kèm bị lỗi `[?]` khi cài đè hoặc tải lại app bằng cách lưu dữ liệu Base64 `dataUrl` lâu dài và nạp fallback qua Tauri Asset Protocol (`convertFileSrc`) từ thư mục `customDataPath/uploads/`.

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
