import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAiRouterConnections,
  getAiRouterProviderCatalog,
  type AiRouterConnection,
  type AiRouterProvider,
} from "@/runtime/aiRouter";

const LOCAL_AI_ACCOUNTS = [
  { id: "antigravity", name: "Gemini" },
  { id: "codex", name: "GPT" },
  { id: "claude", name: "Claude" },
  { id: "grok-cli", name: "Grok" },
] as const;

const LOCAL_ACCOUNT_PROVIDER_IDS: Record<string, readonly string[]> = {
  antigravity: ["antigravity", "gemini"],
  codex: ["codex", "chatgpt", "openai"],
  claude: ["claude"],
  "grok-cli": ["grok-cli", "grok", "xai"],
};

export function ModelSettings() {
  const [connections, setConnections] = useState<AiRouterConnection[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<AiRouterProvider[]>([]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const data = await getAiRouterConnections();
      setConnections(data);
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Failed to connect to local AI Router.");
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const refreshProviderCatalog = useCallback(async () => {
    try {
      const catalog = await getAiRouterProviderCatalog();
      setProviderCatalog(catalog);
    } catch {
      // Ignore catalog fetch error in fallback mode
    }
  }, []);

  useEffect(() => {
    if (showProviderManager && providerCatalog.length === 0) {
      void refreshProviderCatalog();
    }
  }, [showProviderManager, providerCatalog.length, refreshProviderCatalog]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">
          Mô hình AI & Tài khoản Kết nối (AI Models & Connected Accounts)
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowProviderManager((prev) => !prev)}
          className="gap-1.5 cursor-pointer text-xs"
        >
          {showProviderManager ? "Đóng Quản lý Provider" : "+ Thêm Provider Mới"}
        </Button>
      </div>

      <Card className="mt-3 p-4">
        {loadingConnections ? (
          <div className="py-4 text-center text-xs text-neutral-400">Đang tải danh sách mô hình AI Router...</div>
        ) : connectionError ? (
          <div className="flex items-center justify-between gap-3 text-xs text-red-300">
            <span>{connectionError}</span>
            <Button size="sm" variant="secondary" onClick={() => void loadConnections()}>
              <RefreshCw className="size-3.5" /> Thử lại
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LOCAL_AI_ACCOUNTS.map((acc) => {
              const matchedConns = connections.filter((c) =>
                LOCAL_ACCOUNT_PROVIDER_IDS[acc.id]?.includes(c.provider)
              );
              const activeConn = matchedConns.find((c) => c.isActive) || matchedConns[0];

              return (
                <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-950/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-100">{acc.name}</span>
                      {activeConn?.isActive ? (
                        <Badge tone="green" className="text-[10px]">Ready</Badge>
                      ) : (
                        <Badge tone="neutral" className="text-[10px]">Chưa kết nối</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      {activeConn?.accountLabel || activeConn?.email || activeConn?.name || "Chưa có tài khoản liên kết"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowProviderManager(true)}
                    className="text-xs cursor-pointer"
                  >
                    Cấu hình
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
