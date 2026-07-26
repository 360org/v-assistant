import { useState, useEffect } from "react";
import { CheckCircle2, Download, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openExternalUrl } from "@/components/MessageContent";
import { checkAppUpdate, type AppUpdateInfo } from "@/runtime/updater";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { t } from "@/lib/i18n";

export function AppUpdateSection() {
  const { language } = useApp();
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    checkAppUpdate().then(setUpdateInfo).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkAppUpdate();
      setUpdateInfo(info);
    } catch {
      // Ignore update error gracefully
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-neutral-300">
        🔄 {t("software_update_title", language)}
      </h2>
      <Card
        className={cn(
          "mt-3 transition-all",
          updateInfo?.hasUpdate
            ? "border-gold-400/50 bg-gradient-to-br from-gold-950/20 via-neutral-900 to-neutral-900"
            : "border-neutral-800 bg-neutral-900/40"
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-100">
                {t("current_version", language)}: v{__V_ASSISTANT_VERSION__}
              </span>
              {updateInfo?.hasUpdate ? (
                <Badge tone="gold" className="animate-pulse gap-1">
                  <Sparkles className="size-3 text-gold-300" />
                  {t("has_update", language)} v{updateInfo.latestVersion}
                </Badge>
              ) : (
                <Badge tone="green" className="gap-1">
                  <CheckCircle2 className="size-3 text-emerald-400" />
                  {t("latest", language)}
                </Badge>
              )}
            </div>

            <p className="mt-1 text-xs text-neutral-400">
              {updateInfo?.hasUpdate
                ? (language === "en" ? `New release v${updateInfo.latestVersion} detected from GitHub Releases!` : `Phát hiện bản phát hành mới v${updateInfo.latestVersion} từ GitHub Releases!`)
                : t("checking_for_updates", language)}
            </p>

            {updateInfo?.releaseNotes && updateInfo.hasUpdate && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-300">
                <div className="font-medium text-gold-300 mb-1">📝 {t("release_notes", language)}</div>
                <div className="whitespace-pre-wrap font-mono text-[11px] text-neutral-400">
                  {updateInfo.releaseNotes}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="gap-1.5 whitespace-nowrap cursor-pointer hover:border-gold-400"
            >
              <RefreshCw className={cn("size-3.5 text-gold-400", checkingUpdate && "animate-spin")} />
              {checkingUpdate ? t("checking", language) : t("check_for_update", language)}
            </Button>

            {updateInfo?.hasUpdate && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => updateInfo.downloadUrl && openExternalUrl(updateInfo.downloadUrl)}
                className="gap-1.5 whitespace-nowrap cursor-pointer shadow-lg shadow-gold-500/10"
              >
                <Download className="size-3.5" />
                {t("auto_update_download", language)}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
