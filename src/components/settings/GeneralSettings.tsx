import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";

export function GeneralSettings() {
  const {
    selfImprove,
    setSelfImprove,
    language,
    setLanguage,
    theme,
    setTheme,
    resetApp,
  } = useApp();

  return (
    <div className="space-y-8">
      {/* Self-improving Memory */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">Bộ nhớ Tự cải tiến (Self-improving memory)</h2>
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-100">Ghi nhớ ngữ cảnh tự động</div>
            <div className="text-xs text-neutral-400">
              Mỗi Agent sẽ tự học và ghi nhớ các sự thật quan trọng từ đoạn chat để tối ưu phản hồi trong tương lai.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={selfImprove}
            aria-label="Self-improving memory"
            onClick={() => setSelfImprove(!selfImprove)}
            className={cn(
              "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
              selfImprove ? "bg-gold-400" : "bg-neutral-700",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-neutral-950 transition-all",
                selfImprove ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </Card>
      </section>

      {/* Language & Theme Settings */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">Giao diện & Ngôn ngữ (Appearance & Language)</h2>
        <Card className="mt-3 space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-neutral-100">Ngôn ngữ giao diện</div>
              <div className="text-xs text-neutral-400">Chọn ngôn ngữ hiển thị chính của ứng dụng</div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant={language === "vi" ? "primary" : "outline"}
                size="sm"
                onClick={() => setLanguage("vi")}
                className="text-xs cursor-pointer"
              >
                Tiếng Việt
              </Button>
              <Button
                variant={language === "en" ? "primary" : "outline"}
                size="sm"
                onClick={() => setLanguage("en")}
                className="text-xs cursor-pointer"
              >
                English
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
            <div>
              <div className="text-sm font-medium text-neutral-100">Chủ đề giao diện (Theme)</div>
              <div className="text-xs text-neutral-400">Tùy chỉnh chế độ hiển thị Sáng / Tối</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={theme === "system" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="text-xs cursor-pointer"
              >
                💻 Theo Hệ thống
              </Button>
              <Button
                variant={theme === "light" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="text-xs cursor-pointer"
              >
                ☀️ Light Mode
              </Button>
              <Button
                variant={theme === "dark" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="text-xs cursor-pointer"
              >
                🌙 Dark Mode
              </Button>
              <Button
                variant={theme === "gold" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTheme("gold")}
                className="text-xs cursor-pointer"
              >
                ✨ Gold Dark
              </Button>
              <Button
                variant={theme === "midnight" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTheme("midnight")}
                className="text-xs cursor-pointer"
              >
                🌌 Midnight
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* Danger Zone */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-red-400">Vùng nguy hiểm (Danger zone)</h2>
        <Card className="mt-3 flex items-center justify-between p-4 border-red-900/40 bg-red-950/10">
          <div>
            <div className="text-sm font-medium text-neutral-100">Reset ứng dụng về trạng thái ban đầu</div>
            <div className="text-xs text-neutral-400">
              Xóa sạch toàn bộ hội thoại, tài liệu tri thức, cấu hình Agent và đăng xuất tài khoản.
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={resetApp} className="cursor-pointer">
            Reset ngay
          </Button>
        </Card>
      </section>
    </div>
  );
}
