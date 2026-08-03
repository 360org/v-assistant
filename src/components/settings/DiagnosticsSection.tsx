import { useState, useEffect } from "react";
import { ClipboardCheck, ClipboardCopy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildDiagnosticsBundle } from "@/lib/diagnostics";
import { useApp } from "@/lib/store";
import { getRuntimeStatus } from "@/runtime/nanoclaw";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

export function DiagnosticsSection() {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState<{ engine_running: boolean; ai_router_running: boolean } | null>(null);
  const [restartingRouter, setRestartingRouter] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const bundle = buildDiagnosticsBundle(app);

  const fetchStatus = async () => {
    const status = await getRuntimeStatus();
    if (status) {
      setRuntimeInfo({
        engine_running: status.engine_running,
        ai_router_running: status.ai_router_running,
      });
    }
  };

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(interval);
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleRestartRouter = async () => {
    setRestartingRouter(true);
    setRestartMessage(null);
    try {
      await invoke("runtime_restart_ai_router");
      setRestartMessage("Đang khởi động lại...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchStatus();
      setRestartMessage("✅ Đã khởi động lại thành công!");
      setTimeout(() => setRestartMessage(null), 3000);
    } catch (err) {
      setRestartMessage(`❌ Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRestartingRouter(false);
    }
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-300">Chẩn đoán</h2>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        Xuất gói hỗ trợ đã che secret để kiểm tra Runner, MCP, Knowledge, Schedule và Integrations mà không lộ API key/token.
      </p>
      <Card className="mt-3 space-y-3.5 p-5">
        <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 pb-3.5 text-xs text-neutral-400 sm:grid-cols-4">
          <span>Kỹ năng: {bundle.counts.installedEngineSkills}</span>
          <span>MCP: {bundle.counts.mcpServers}</span>
          <span>Tri thức: {bundle.counts.knowledgeFiles}</span>
          <span>Lịch: {bundle.counts.scheduledTasks}</span>
        </div>
        <div className="flex flex-col gap-2.5 pt-1 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-neutral-400">
            <span className="flex items-center gap-1.5">
              AI Router:
              {runtimeInfo ? (
                runtimeInfo.ai_router_running ? (
                  <span className="font-semibold text-green-400">🟢 Đang chạy</span>
                ) : (
                  <span className="font-semibold text-red-400">🔴 Đang dừng</span>
                )
              ) : (
                <span className="text-neutral-500">Đang kiểm tra...</span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              Agent Runner:
              {runtimeInfo ? (
                runtimeInfo.engine_running ? (
                  <span className="font-semibold text-green-400">🟢 Đang chạy</span>
                ) : (
                  <span className="font-semibold text-red-400">🔴 Đang dừng</span>
                )
              ) : (
                <span className="text-neutral-500">Đang kiểm tra...</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {restartMessage && <span className="text-[11px] text-neutral-400">{restartMessage}</span>}
            <Button
              size="sm"
              variant="outline"
              disabled={restartingRouter}
              onClick={() => void handleRestartRouter()}
              className="h-7 px-2.5 text-[11px] font-medium"
            >
              <RefreshCw className={cn("mr-1 size-3 text-gold-400", restartingRouter && "animate-spin")} />
              Khởi động lại AI Router
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-3.5">
          <span className="text-xs text-neutral-500">Nguồn capability: {bundle.capabilitySources.join(", ")}</span>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? <ClipboardCheck className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
            {copied ? "Đã chép" : "Chép gói hỗ trợ"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
