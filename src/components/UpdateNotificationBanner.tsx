import { useEffect, useState } from "react";
import { Sparkles, Download, X, ArrowRight } from "lucide-react";
import { checkAppUpdate, type AppUpdateInfo } from "@/runtime/updater";
import { useApp } from "@/lib/store";

export function UpdateNotificationBanner() {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { setView } = useApp();

  useEffect(() => {
    // Check if dismissed in this session
    if (sessionStorage.getItem("vua:update-banner-dismissed") === "true") {
      setDismissed(true);
      return;
    }

    checkAppUpdate()
      .then((info) => {
        if (info.hasUpdate) {
          setUpdateInfo(info);
        }
      })
      .catch(() => {});
  }, []);

  if (!updateInfo?.hasUpdate || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("vua:update-banner-dismissed", "true");
  };

  const handleDownload = () => {
    if (updateInfo.downloadUrl) {
      window.open(updateInfo.downloadUrl, "_blank");
    } else {
      setView("settings");
    }
  };

  return (
    <div className="relative z-30 flex items-center justify-between gap-4 border-b border-emerald-500/30 bg-emerald-950/80 px-4 py-2.5 backdrop-blur-md text-emerald-100 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Sparkles className="size-4 animate-pulse" />
        </div>
        <div className="min-w-0 text-sm">
          <span className="font-semibold text-emerald-300">
            Có bản cập nhật mới v{updateInfo.latestVersion}!
          </span>{" "}
          <span className="hidden md:inline text-emerald-200/80 truncate">
            ({updateInfo.releaseTitle || "V Assistant Release"}) — Tải ngay để nâng cấp tính năng mới nhất.
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-emerald-400 transition-colors shadow-sm cursor-pointer"
        >
          <Download className="size-3.5" />
          <span>Tải Cập Nhật (.dmg)</span>
        </button>

        <button
          onClick={() => setView("settings")}
          className="hidden sm:flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-900/40 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-800/50 transition-colors cursor-pointer"
        >
          <span>Chi tiết</span>
          <ArrowRight className="size-3" />
        </button>

        <button
          onClick={handleDismiss}
          title="Bỏ qua trong phiên này"
          className="rounded-lg p-1 text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-200 transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
