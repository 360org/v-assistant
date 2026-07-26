import { useState, useRef, useEffect } from "react";
import { Check, Copy, FolderOpen, HardDrive, RotateCcw, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";

export function WorkspaceSettingsSection() {
  const {
    customDataPath,
    setCustomDataPath,
    exportFullBackupData,
    importFullBackupData,
  } = useApp();

  const [dataPathInput, setDataPathInput] = useState(customDataPath || "~/.v-assistant/data");
  const [savedPathMsg, setSavedPathMsg] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDataPathInput(customDataPath || "~/.v-assistant/data");
  }, [customDataPath]);

  const handleCopyDataPath = async () => {
    const p = customDataPath || "~/.v-assistant/data";
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  const handleSelectFolder = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("pick_directory");
      if (selected && typeof selected === "string") {
        setDataPathInput(selected);
        return;
      }
    } catch (err) {
      console.warn("Desktop pick_directory command failed, falling back to web file input:", err);
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      // @ts-expect-error path is present in Desktop webview File objects
      const fullPath: string | undefined = firstFile.path;
      if (fullPath) {
        const lastSlash = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
        if (lastSlash > 0) {
          setDataPathInput(fullPath.substring(0, lastSlash));
          return;
        }
      }
      const relPath = firstFile.webkitRelativePath || firstFile.name;
      const folderName = relPath.split("/")[0] || relPath.split("\\")[0];
      if (folderName) {
        setDataPathInput(`~/.v-assistant/${folderName}`);
      }
    }
  };

  const handleSaveDataPath = () => {
    const cleanPath = dataPathInput.trim();
    setCustomDataPath(cleanPath);
    if (cleanPath) {
      void import("@tauri-apps/api/core").then(({ invoke }) => {
        void invoke("save_custom_data_text", {
          customDir: cleanPath,
          relativePath: "README.txt",
          content: "Thư mục lưu trữ dữ liệu Vua AI Assistant.\nCác tệp tải lên (uploads/), nhật ký trò chuyện (chats/) và bản sao lưu tự động (v_assistant_backup.json) được lưu trữ tại đây.",
        }).catch(() => {});
      }).catch(() => {});
    }
    setSavedPathMsg("✅ Đã lưu vị trí & tự động đồng bộ dữ liệu vào thư mục host!");
    setTimeout(() => setSavedPathMsg(null), 4000);
  };

  const handleResetDefaultDataPath = () => {
    setCustomDataPath("");
    setDataPathInput("~/.v-assistant/data");
    setSavedPathMsg("✅ Đã đặt lại đường dẫn dữ liệu mặc định!");
    setTimeout(() => setSavedPathMsg(null), 4000);
  };

  const handleExportBackup = () => {
    try {
      const jsonStr = exportFullBackupData();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `v_assistant_backup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg("✅ Đã xuất tệp sao lưu dữ liệu thành công!");
      setTimeout(() => setBackupMsg(null), 4000);
    } catch (e) {
      console.error(e);
      setBackupMsg("❌ Lỗi xuất dữ liệu sao lưu.");
    }
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      if (content) {
        const ok = importFullBackupData(content);
        if (ok) {
          setBackupMsg("✅ Đã khôi phục dữ liệu thành công!");
          setTimeout(() => setBackupMsg(null), 4000);
        } else {
          setBackupMsg("❌ Tệp sao lưu không đúng định dạng.");
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      {/* Data Storage Location Section */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">
            Nơi lưu trữ dữ liệu (Data Storage Location)
          </h2>
          <Badge tone={customDataPath ? "gold" : "neutral"}>
            {customDataPath ? "Đã tùy chỉnh" : "Mặc định hệ thống"}
          </Badge>
        </div>

        <Card className="mt-3 flex flex-col gap-4 p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
              <HardDrive className="size-4 text-gold-400" />
              Đường dẫn lưu dữ liệu hiện tại trên máy host
            </div>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2">
              <code className="flex-1 truncate font-mono text-xs text-gold-300">
                {customDataPath || "~/.v-assistant/data"}
              </code>
              <button
                onClick={handleCopyDataPath}
                title="Chép đường dẫn"
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                {copiedPath ? (
                  <>
                    <Check className="size-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-neutral-400">
              Thay đổi đường dẫn lưu trữ thủ công hoặc chọn thư mục:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={dataPathInput}
                onChange={(e) => setDataPathInput(e.target.value)}
                placeholder="Ví dụ: /Volumes/DATA/v-assistant-storage hoặc D:\V-Assistant-Data"
                className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 focus:border-gold-500/50 focus:outline-hidden"
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                // @ts-expect-error webkitdirectory is standard prop supported by browsers
                webkitdirectory=""
                directory=""
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSelectFolder}
                  className="gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="size-3.5 text-gold-400" />
                  Chọn thư mục
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveDataPath}
                  className="gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Save className="size-3.5" />
                  Lưu vị trí
                </Button>
              </div>
            </div>

            {savedPathMsg && (
              <div className="mt-1 text-xs font-medium text-emerald-400 transition-all">
                {savedPathMsg}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-neutral-800/80 pt-3">
            <span className="text-xs text-neutral-500">
              Khôi phục lại đường dẫn lưu trữ thư mục mặc định của ứng dụng
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetDefaultDataPath}
              className="gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              Đặt lại mặc định
            </Button>
          </div>

          <div className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-3 text-xs leading-relaxed text-neutral-300">
            <span className="font-bold text-gold-400">💡 Gợi ý sao lưu tự động:</span> Bạn có thể trỏ thư mục lưu trữ sang các thư mục đám mây như <code className="rounded bg-neutral-900 px-1 py-0.5 font-mono text-gold-300">iCloud Drive</code>, <code className="rounded bg-neutral-900 px-1 py-0.5 font-mono text-gold-300">Google Drive</code> hoặc ổ cứng gắn ngoài SSD để dữ liệu hội thoại và kiến thức luôn được tự động backup an toàn!
          </div>
        </Card>
      </section>

      {/* Backup & Restore Section */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">
          📦 Sao lưu & Khôi phục Dữ liệu (Backup & Restore)
        </h2>
        <Card className="mt-3 space-y-4">
          <input
            type="file"
            ref={backupFileInputRef}
            accept=".json"
            className="hidden"
            onChange={handleImportBackupFile}
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-neutral-100">Xuất dữ liệu Sao lưu (.json)</div>
              <div className="text-xs text-neutral-400">Đóng gói toàn bộ lịch sử Chat, Kỹ năng, Lịch đăng bài thành tệp sao lưu</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportBackup}
              className="gap-1.5 whitespace-nowrap cursor-pointer hover:border-gold-400"
            >
              <HardDrive className="size-3.5 text-gold-400" />
              Xuất file Sao lưu
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800/80 pt-3">
            <div>
              <div className="text-sm font-medium text-neutral-100">Khôi phục Dữ liệu từ Tệp Backup</div>
              <div className="text-xs text-neutral-400">Tải tệp .json sao lưu lên để khôi phục toàn bộ cài đặt và lịch sử</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => backupFileInputRef.current?.click()}
              className="gap-1.5 whitespace-nowrap cursor-pointer hover:border-gold-400"
            >
              <FolderOpen className="size-3.5 text-gold-400" />
              Chọn tệp Backup
            </Button>
          </div>

          {backupMsg && (
            <div className="mt-2 text-xs font-semibold text-emerald-400 transition-all">
              {backupMsg}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
