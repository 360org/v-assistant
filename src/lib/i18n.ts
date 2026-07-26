/**
 * Lightweight i18n internationalization module for Vua AI Assistant.
 * Supports Vietnamese (default) and English with zero external dependencies.
 */

export type Language = "vi" | "en";

export type Theme = "system" | "light" | "dark" | "gold" | "midnight";

export const translations = {
  vi: {
    app_title: "Vua AI Assistant",
    app_subtitle: "Trợ lý AI dành cho mọi người",
    home: "Trang chủ",
    chat: "Trò chuyện",
    sessions: "Cuộc trò chuyện",
    agents: "Trợ lý AI",
    skills: "Kỹ năng",
    knowledge: "Bộ tri thức",
    media: "Kho Media",
    vault: "Kho Bảo mật Vault",
    scheduled: "Lịch đăng bài & Tác vụ",
    integrations: "Tích hợp & Channels",
    settings: "Cài đặt hệ thống",
    language: "Ngôn ngữ giao diện",
    theme: "Chủ đề giao diện",
    export_data: "Xuất dữ liệu Sao lưu (.json)",
    import_data: "Khôi phục dữ liệu từ Backup",
    export_success: "Xuất tệp sao lưu dữ liệu thành công!",
    import_success: "Khôi phục dữ liệu thành công!",
    select_language: "Chọn ngôn ngữ",
    select_theme: "Chọn chủ đề màu",
    save_settings: "Lưu cài đặt",
    connect: "Kết nối",
    connected: "Đã kết nối",
    disconnect: "Ngắt kết nối",
    install: "Cài đặt Channel",
    installed: "Đã cài đặt",
    uninstall: "Gỡ cài đặt",
    status_realtime: "Trạng thái kết nối Realtime",
    verified_at: "Xác thực lúc",
  },
  en: {
    app_title: "Vua AI Assistant",
    app_subtitle: "AI Assistant for Everyone",
    home: "Home",
    chat: "Chat",
    sessions: "Sessions",
    agents: "AI Agents",
    skills: "Skills",
    knowledge: "Knowledge Base",
    media: "Media Vault",
    vault: "Security Vault",
    scheduled: "Scheduled Tasks",
    integrations: "Integrations & Channels",
    settings: "System Settings",
    language: "Interface Language",
    theme: "UI Theme",
    export_data: "Export Backup Data (.json)",
    import_data: "Import Data from Backup",
    export_success: "Backup data exported successfully!",
    import_success: "Data restored successfully!",
    select_language: "Select Language",
    select_theme: "Select UI Theme",
    save_settings: "Save Settings",
    connect: "Connect",
    connected: "Connected",
    disconnect: "Disconnect",
    install: "Install Channel",
    installed: "Installed",
    uninstall: "Uninstall",
    status_realtime: "Realtime Status",
    verified_at: "Verified at",
  },
};

export function t(key: keyof typeof translations.vi, lang: Language = "vi"): string {
  return translations[lang]?.[key] ?? translations.vi[key] ?? key;
}
