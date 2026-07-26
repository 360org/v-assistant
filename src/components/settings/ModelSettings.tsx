import { useState, useEffect, useCallback } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, KeyRound, Link, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deleteAiRouterConnection,
  exchangeAiRouterOAuthCallbackUrl,
  getAiRouterConnections,
  getAiRouterProviderCatalog,
  saveAiRouterConnection,
  signInWithAiRouterCore,
  testAiRouterConnection,
  toggleAiRouterConnection,
  type AiRouterConnection,
  type AiRouterProvider,
} from "@/runtime/aiRouter";
import { openExternalUrl } from "@/components/MessageContent";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { t } from "@/lib/i18n";
import { beginManualSignIn, completeManualSignIn, exchangeCode, fetchVendorAccount, type ManualSignInAttempt } from "@/runtime/oauth";
import { vaultGet } from "@/runtime/vault";
import type { ProviderId } from "@/lib/catalog";

const LOCAL_AI_ACCOUNTS = [
  { id: "antigravity", name: "Gemini", providerId: "antigravity" },
  { id: "codex", name: "GPT", providerId: "codex" },
  { id: "claude", name: "Claude", providerId: "claude" },
  { id: "grok-cli", name: "Grok", providerId: "grok-cli" },
] as const;

const LOCAL_ACCOUNT_PROVIDER_IDS: Record<string, readonly string[]> = {
  antigravity: ["antigravity", "gemini"],
  codex: ["codex", "chatgpt", "openai"],
  claude: ["claude"],
  "grok-cli": ["grok-cli", "grok", "xai"],
};

export function ModelSettings() {
  const { providerConfigs, connectProvider, user, language } = useApp();
  const [connections, setConnections] = useState<AiRouterConnection[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<AiRouterProvider[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [providerQuery, setProviderQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<AiRouterProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [verifyingCallback, setVerifyingCallback] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);
  const [manualCallbackUrl, setManualCallbackUrl] = useState("");
  const [manualAttempt, setManualAttempt] = useState<ManualSignInAttempt | null>(null);
  const [authUrlCopied, setAuthUrlCopied] = useState(false);
  const [actionConnId, setActionConnId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const data = await getAiRouterConnections();
      setConnections(data);
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Không thể kết nối đến AI Router local.");
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const refreshProviderCatalog = useCallback(async () => {
    try {
      setCatalogError(null);
      const catalog = await getAiRouterProviderCatalog();
      setProviderCatalog(catalog);
      if (catalog.length > 0 && !selectedProvider) {
        setSelectedProvider(catalog[0]);
      }
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Không thể tải danh mục Provider.");
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (showProviderManager && providerCatalog.length === 0) {
      void refreshProviderCatalog();
    }
  }, [showProviderManager, providerCatalog.length, refreshProviderCatalog]);

  const filteredProviders = providerCatalog.filter(
    (item) =>
      item.name.toLowerCase().includes(providerQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(providerQuery.toLowerCase())
  );

  const openConfigureModalForAccount = async (accProviderId: string) => {
    setShowProviderManager(true);
    setConnectMessage(null);

    let catalog = providerCatalog;
    if (catalog.length === 0) {
      try {
        catalog = await getAiRouterProviderCatalog();
        setProviderCatalog(catalog);
      } catch {
        /* fallback */
      }
    }

    const matchedRaw = catalog.find((p) =>
      LOCAL_ACCOUNT_PROVIDER_IDS[accProviderId]?.includes(p.id.toLowerCase())
    );

    const matched: AiRouterProvider = matchedRaw ? {
      ...matchedRaw,
      oauth: matchedRaw.oauth || accProviderId === "antigravity" || accProviderId === "claude" || accProviderId === "codex" || accProviderId === "openai",
      apiKey: matchedRaw.apiKey !== false,
    } : {
      id: accProviderId,
      name: accProviderId === "antigravity" ? "Gemini" : accProviderId === "codex" ? "GPT / OpenAI" : accProviderId === "claude" ? "Claude" : accProviderId === "grok-cli" ? "Grok" : accProviderId,
      oauth: accProviderId === "antigravity" || accProviderId === "claude" || accProviderId === "codex",
      apiKey: true,
    };

    setSelectedProvider(matched);

    const storeCfg = providerConfigs[matched.id as ProviderId] || providerConfigs[accProviderId as ProviderId];
    const savedKey = storeCfg?.apiKey || (await vaultGet(`provider_api_key:${matched.id}`).catch(() => null));
    if (savedKey) {
      setApiKey(savedKey);
    } else {
      setApiKey("");
    }
  };

  const parseEmailFromTokenData = (tokens?: { email?: string; idToken?: string } | null, callbackUrl?: string): string | undefined => {
    if (tokens?.email && tokens.email.includes("@")) return tokens.email;

    if (tokens?.idToken) {
      try {
        const parts = tokens.idToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (payload.email && typeof payload.email === "string" && payload.email.includes("@")) {
            return payload.email;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (callbackUrl) {
      try {
        const urlObj = new URL(callbackUrl.trim());
        const email = urlObj.searchParams.get("email") || urlObj.searchParams.get("user") || urlObj.searchParams.get("login");
        if (email && email.includes("@")) return email;
      } catch {
        /* ignore */
      }
    }

    return undefined;
  };

  const saveConnectionAndCleanupDuplicates = async (
    providerId: string,
    providerName: string,
    key: string,
    authType: "subscription" | "api-key",
    tokenData?: { email?: string; idToken?: string } | null,
    callbackUrlStr?: string
  ) => {
    const vendorAcc = await fetchVendorAccount(providerId as ProviderId, key).catch(() => null);
    const targetEmail =
      vendorAcc?.label && vendorAcc.label.includes("@")
        ? vendorAcc.label
        : tokenData?.email || parseEmailFromTokenData(tokenData, callbackUrlStr);

    const matchedProviderKeys = [providerId.toLowerCase()];
    if (providerId === "grok-cli" || providerId === "grok") matchedProviderKeys.push("grok-cli", "grok", "xai");
    if (providerId === "codex" || providerId === "chatgpt" || providerId === "openai") matchedProviderKeys.push("codex", "chatgpt", "openai");
    if (providerId === "antigravity" || providerId === "gemini") matchedProviderKeys.push("antigravity", "gemini");

    const existingConn = connections.find(
      (c) =>
        matchedProviderKeys.some((p) => c.provider.toLowerCase() === p || c.id.toLowerCase().startsWith(p)) &&
        ((targetEmail &&
          targetEmail.includes("@") &&
          (c.email?.toLowerCase() === targetEmail.toLowerCase() || c.accountLabel?.toLowerCase() === targetEmail.toLowerCase())) ||
          c.credentialRef === key)
    );

    const connId = existingConn ? existingConn.id : `${providerId}_${Date.now()}`;
    const countForProv = connections.filter((c) =>
      matchedProviderKeys.some((p) => c.provider.toLowerCase() === p || c.id.toLowerCase().startsWith(p))
    ).length + 1;
    const maskedKey = key.length > 10 ? `Key (${key.slice(0, 4)}...${key.slice(-4)})` : "API Key";
    const accountLabel =
      targetEmail ||
      existingConn?.accountLabel ||
      existingConn?.email ||
      vendorAcc?.label ||
      (authType === "api-key" ? maskedKey : `${providerName} Account #${countForProv}`);

    await saveAiRouterConnection({
      id: connId,
      provider: providerId,
      name: providerName,
      accountLabel,
      email: targetEmail || existingConn?.email,
      authType,
      credentialRef: key,
      isActive: true,
    });

    for (const c of connections) {
      if (
        c.id !== connId &&
        matchedProviderKeys.some((p) => c.provider.toLowerCase() === p || c.id.toLowerCase().startsWith(p)) &&
        ((targetEmail &&
          targetEmail.includes("@") &&
          (c.email?.toLowerCase() === targetEmail.toLowerCase() || c.accountLabel?.toLowerCase() === targetEmail.toLowerCase())) ||
          c.credentialRef === key)
      ) {
        await deleteAiRouterConnection(c.id).catch(() => {});
      }
    }
  };

  const connectApiKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      const providerId = selectedProvider.id as ProviderId;
      await connectProvider(providerId, {
        apiKey: apiKey.trim(),
        connectionStatus: "connected",
      });

      await saveConnectionAndCleanupDuplicates(
        selectedProvider.id,
        selectedProvider.name,
        apiKey.trim(),
        "api-key"
      ).catch(() => {});

      setConnectMessage(`✅ Kết nối thành công API Key cho ${selectedProvider.name}!`);
      await loadConnections();
      setTimeout(() => {
        setShowProviderManager(false);
      }, 1000);
    } catch (err) {
      setConnectMessage(`❌ Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };


  const handleTestConnection = async (connId: string) => {
    setActionConnId(connId);
    try {
      await testAiRouterConnection(connId);
      await loadConnections();
    } catch (e) {
      console.error(e);
    } finally {
      setActionConnId(null);
    }
  };

  const handleToggleConnection = async (connId: string, currentActive: boolean) => {
    setActionConnId(connId);
    try {
      await toggleAiRouterConnection(connId, !currentActive);
      await loadConnections();
    } catch (e) {
      console.error(e);
    } finally {
      setActionConnId(null);
    }
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!confirm("Bạn có chắc muốn xóa kết nối AI này khỏi AI Router?")) return;
    setActionConnId(connId);
    try {
      await deleteAiRouterConnection(connId);
      await loadConnections();
    } catch (e) {
      console.error(e);
    } finally {
      setActionConnId(null);
    }
  };

  const handleOAuthSignIn = async () => {
    if (!selectedProvider) return;
    setConnecting(true);
    setConnectMessage(null);
    setManualAuthUrl(null);
    setManualAttempt(null);
    try {
      const attempt = await beginManualSignIn(selectedProvider.id as ProviderId).catch(() => null);
      if (attempt) {
        setManualAttempt(attempt);
        setManualAuthUrl(attempt.authUrl);
        setConnecting(false);
      } else {
        void signInWithAiRouterCore(selectedProvider.id, (url) => {
          setManualAuthUrl(url);
          setConnecting(false);
          void openExternalUrl(url);
        }).then(async (tokens) => {
          if (tokens) {
            const key = tokens.apiKey || tokens.accessToken || "";
            if (key) {
              await connectProvider(selectedProvider.id as ProviderId, {
                apiKey: key,
                refreshToken: tokens.refreshToken,
                projectId: tokens.projectId,
                expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
                connectionStatus: "connected",
              });

              await saveConnectionAndCleanupDuplicates(
                selectedProvider.id,
                selectedProvider.name,
                key,
                "subscription",
                tokens
              ).catch(() => {});
            }
            setConnectMessage(`✅ Đăng nhập thành công tài khoản OAuth ${selectedProvider.name}!`);
            await loadConnections();
            setTimeout(() => {
              setShowProviderManager(false);
            }, 1000);
          }
        }).catch(() => {
          /* manual paste will handle it if background popup fails */
        }).finally(() => {
          setConnecting(false);
        });
      }
    } catch (err) {
      setConnectMessage(`❌ Lỗi OAuth: ${err instanceof Error ? err.message : String(err)}`);
      setConnecting(false);
    }
  };

  const handleCompleteManualCallback = async () => {
    if (!selectedProvider || !manualCallbackUrl.trim()) return;
    setVerifyingCallback(true);
    setConnectMessage(null);
    try {
      let key = "";
      let refreshToken: string | undefined;
      let projectId: string | undefined;
      let expiresAt: number | undefined;

      try {
        if (manualAttempt) {
          const res = await completeManualSignIn(manualAttempt, manualCallbackUrl.trim());
          key = res.apiKey;
          refreshToken = res.refreshToken;
          projectId = res.projectId;
          expiresAt = res.expiresAt;
        } else {
          const tokens = await exchangeAiRouterOAuthCallbackUrl(selectedProvider.id, manualCallbackUrl.trim());
          key = tokens.apiKey || tokens.accessToken || "";
          refreshToken = tokens.refreshToken;
          projectId = tokens.projectId;
          expiresAt = tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined;
        }
      } catch (routerErr) {
        let urlObj: URL | null = null;
        try {
          urlObj = new URL(manualCallbackUrl.trim());
        } catch {
          /* ignore */
        }
        const code = urlObj?.searchParams.get("code") || urlObj?.searchParams.get("token") || manualCallbackUrl.trim();
        const state = urlObj?.searchParams.get("state") || "";

        if (selectedProvider.id === "antigravity" || selectedProvider.id === "gemini") {
          const res = await exchangeCode("gemini", code, "", "http://localhost:1420/callback", state);
          key = res.apiKey;
          refreshToken = res.refreshToken;
          projectId = res.projectId;
          expiresAt = res.expiresAt;
        } else if (selectedProvider.id === "claude") {
          const res = await exchangeCode("claude", code, "", "http://localhost:443/callback", state);
          key = res.apiKey;
          refreshToken = res.refreshToken;
          expiresAt = res.expiresAt;
        } else {
          throw routerErr;
        }
      }

      if (key) {
        const providerId = selectedProvider.id as ProviderId;
        await connectProvider(providerId, {
          apiKey: key,
          refreshToken,
          projectId,
          expiresAt,
          connectionStatus: "connected",
        });

        await saveConnectionAndCleanupDuplicates(
          selectedProvider.id,
          selectedProvider.name,
          key,
          "subscription",
          null,
          manualCallbackUrl.trim()
        ).catch(() => {});

        setConnectMessage(`✅ Xác thực & lưu kết nối thành công tài khoản OAuth ${selectedProvider.name}!`);
        setManualCallbackUrl("");
        setManualAttempt(null);
        setConnecting(false);
        await loadConnections();
        setTimeout(() => {
          setShowProviderManager(false);
        }, 1000);
      } else {
        throw new Error("Không nhận được token xác thực từ URL callback.");
      }
    } catch (err) {
      setConnectMessage(`❌ Lỗi Callback: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVerifyingCallback(false);
    }
  };

  const copyManualAuthUrl = async () => {
    if (!manualAuthUrl) return;
    await navigator.clipboard.writeText(manualAuthUrl);
    setAuthUrlCopied(true);
    setTimeout(() => setAuthUrlCopied(false), 2000);
  };


  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-300">
            {t("models_connected_title", language)}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("models_connected_desc", language)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadConnections()}
            disabled={loadingConnections}
            className="gap-1.5 cursor-pointer text-xs font-medium hover:border-gold-400"
            title={language === "en" ? "Reload all AI Router connections" : "Tải lại toàn bộ danh sách kết nối AI Router"}
          >
            <RefreshCw className={cn("size-3.5 text-gold-400", loadingConnections && "animate-spin")} />
            {loadingConnections ? t("checking", language) : (language === "en" ? "Reload List" : "Làm mới danh sách")}
          </Button>
          <Button
            variant={showProviderManager ? "secondary" : "primary"}
            size="sm"
            onClick={() => setShowProviderManager((prev) => !prev)}
            className="gap-1.5 cursor-pointer text-xs font-medium"
          >
            {showProviderManager ? t("close_provider_manager", language) : t("add_provider", language)}
          </Button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <Card className="mt-3 p-4">
        {loadingConnections ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            {language === "en" ? "Checking AI Router connections..." : "Đang kiểm tra danh sách kết nối AI Router..."}
          </div>
        ) : connectionError ? (
          <div className="flex items-center justify-between gap-3 text-xs text-red-300">
            <span>⚠️ {connectionError}</span>
            <Button size="sm" variant="secondary" onClick={() => void loadConnections()} className="cursor-pointer">
              <RefreshCw className="size-3.5" /> {language === "en" ? "Retry" : "Thử lại"}
            </Button>
          </div>
        ) : (
          (() => {
            interface DisplayCard {
              key: string;
              id: string;
              providerId: string;
              name: string;
              accountLabel: string;
              isActive: boolean;
              defaultModel: string;
              connId?: string;
            }

            const renderCards: DisplayCard[] = [];

            // Deduplicate connections by provider & email/accountLabel so duplicate cards with the same email don't render
            const dedupeMap = new Map<string, (typeof connections)[number]>();
            connections.forEach((conn) => {
              const providerId = conn.provider.toLowerCase();
              let normalizedProv = providerId;
              if (providerId === "grok-cli" || providerId === "grok" || providerId === "xai") normalizedProv = "grok-cli";
              if (providerId === "codex" || providerId === "chatgpt" || providerId === "openai") normalizedProv = "codex";
              if (providerId === "antigravity" || providerId === "gemini") normalizedProv = "antigravity";

              const label = (conn.accountLabel || conn.email || conn.label || conn.name || "").toLowerCase().trim();
              const dedupeKey = `${normalizedProv}::${label}`;

              const existing = dedupeMap.get(dedupeKey);
              if (!existing) {
                dedupeMap.set(dedupeKey, conn);
              } else {
                // If current conn is Active and existing is Disabled, prefer Active!
                if (conn.isActive && !existing.isActive) {
                  dedupeMap.set(dedupeKey, conn);
                }
              }
            });

            const deduplicatedConnections = Array.from(dedupeMap.values());

            // 1. Render EVERY unique connection in `connections` (from AI Router) as an individual card!
            deduplicatedConnections.forEach((conn, idx) => {
              const providerId = conn.provider;
              let name = conn.name;
              if (!name) {
                if (providerId === "antigravity" || providerId === "gemini") name = "Gemini";
                else if (providerId === "codex" || providerId === "openai" || providerId === "chatgpt") name = "GPT";
                else if (providerId === "claude") name = "Claude";
                else if (providerId === "grok-cli" || providerId === "grok") name = "Grok";
                else name = providerId.toUpperCase();
              }

              const accountLabel = conn.accountLabel || conn.email || conn.label || conn.name || `${name} Account #${idx + 1}`;

              renderCards.push({
                key: conn.id,
                id: conn.id,
                providerId,
                name,
                accountLabel,
                isActive: Boolean(conn.isActive ?? true),
                defaultModel: conn.defaultModel || "Standard",
                connId: conn.id,
              });
            });

            // 2. Add fallback card for core accounts if NOT yet represented in renderCards
            LOCAL_AI_ACCOUNTS.forEach((coreAcc) => {
              const hasConn = renderCards.some(
                (card) =>
                  LOCAL_ACCOUNT_PROVIDER_IDS[coreAcc.id]?.includes(card.providerId.toLowerCase()) ||
                  card.providerId.toLowerCase() === coreAcc.providerId.toLowerCase()
              );

              const storeCfg = providerConfigs[coreAcc.providerId as ProviderId] || providerConfigs[coreAcc.id as ProviderId];
              const isStoreConnected = Boolean(storeCfg?.apiKey || storeCfg?.connectionStatus === "connected");

              if (!hasConn) {
                renderCards.push({
                  key: coreAcc.id,
                  id: coreAcc.id,
                  providerId: coreAcc.providerId,
                  name: coreAcc.name,
                  accountLabel: isStoreConnected
                    ? (user?.detail || user?.name || `${coreAcc.name} Connected`)
                    : (language === "en" ? "No linked account" : "Chưa chọn tài khoản liên kết"),
                  isActive: isStoreConnected,
                  defaultModel: "Standard",
                  connId: isStoreConnected ? coreAcc.id : undefined,
                });
              }
            });

            // 3. Add fallback card for any providerConfigs from Store not yet in renderCards
            Object.entries(providerConfigs).forEach(([provId, cfg]) => {
              if (cfg && (cfg.apiKey || cfg.connectionStatus === "connected")) {
                const hasCard = renderCards.some(
                  (card) => card.providerId.toLowerCase() === provId.toLowerCase()
                );
                if (!hasCard) {
                  renderCards.push({
                    key: provId,
                    id: provId,
                    providerId: provId,
                    name: provId.toUpperCase(),
                    accountLabel: user?.detail || user?.name || `${provId.toUpperCase()} Connected`,
                    isActive: true,
                    defaultModel: "Standard",
                    connId: provId,
                  });
                }
              }
            });

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderCards.map((card) => {
                  return (
                    <div key={card.key} className="flex flex-col justify-between p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-neutral-700 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-neutral-100">{card.name}</span>
                            {card.isActive ? (
                              <Badge tone="green" className="text-[10px]">{t("active", language)}</Badge>
                            ) : card.connId ? (
                              <Badge tone="gold" className="text-[10px]">{t("inactive", language)}</Badge>
                            ) : (
                              <Badge tone="neutral" className="text-[10px]">{t("not_configured", language)}</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-neutral-400 font-mono">
                            {card.accountLabel}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openConfigureModalForAccount(card.providerId)}
                          className="text-xs cursor-pointer hover:border-gold-400"
                        >
                          {t("configure", language)}
                        </Button>
                      </div>

                      {card.connId && (
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-neutral-800/80 text-[11px]">
                          <div className="flex items-center gap-2 text-neutral-500">
                            <span>Model: {card.defaultModel}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTestConnection(card.connId!)}
                              disabled={actionConnId === card.connId}
                              className="text-gold-300 hover:underline cursor-pointer"
                            >
                              {t("test_api", language)}
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleToggleConnection(card.connId!, Boolean(card.isActive))}
                              disabled={actionConnId === card.connId}
                              className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
                            >
                              {card.isActive ? t("toggle_off", language) : t("toggle_on", language)}
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteConnection(card.connId!)}
                              disabled={actionConnId === card.connId}
                              className="text-red-400 hover:underline cursor-pointer"
                            >
                              {t("delete", language)}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </Card>

      {/* Provider Manager Form Container (Rendered when showProviderManager is true) */}
      {showProviderManager && (
        <Card className="mt-4 p-5 border-gold-400/40 bg-neutral-950/90 shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <ShieldCheck className="size-4 text-gold-400" />
                {t("provider_manager_title", language)}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                {t("provider_manager_desc", language)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowProviderManager(false)}
              className="size-8 p-0 cursor-pointer"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mt-4">
            {/* Left Col: Provider Catalog Search & List */}
            <div className="md:col-span-5 border-r border-neutral-800/80 pr-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-neutral-500" />
                <input
                  type="text"
                  value={providerQuery}
                  onChange={(e) => setProviderQuery(e.target.value)}
                  placeholder={t("search_provider", language)}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-gold-400/70 focus:outline-none"
                />
              </div>

              {catalogError ? (
                <div className="mt-3 text-xs text-red-300">{catalogError}</div>
              ) : (
                <div className="mt-3 max-h-64 overflow-y-auto space-y-1 pr-1">
                  {filteredProviders.length === 0 ? (
                    <div className="py-4 text-center text-xs text-neutral-500">
                      {language === "en" ? "No matching providers found" : "Không tìm thấy Provider phù hợp"}
                    </div>
                  ) : (
                    filteredProviders.map((prov) => {
                      const isSelected = selectedProvider?.id === prov.id;
                      return (
                        <button
                          key={prov.id}
                          type="button"
                          onClick={() => {
                            setSelectedProvider(prov);
                            setConnectMessage(null);
                            setManualAuthUrl(null);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                            isSelected
                              ? "bg-gold-500/20 text-gold-200 font-semibold border border-gold-500/30"
                              : "text-neutral-300 hover:bg-neutral-900"
                          )}
                        >
                          <span className="truncate">{prov.name}</span>
                          <span className="text-[10px] text-neutral-500 uppercase font-mono">
                            {prov.oauth ? "OAuth" : prov.apiKey ? "API Key" : "Direct"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Right Col: Connection Config Form */}
            <div className="md:col-span-7 flex flex-col justify-between">
              {selectedProvider ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-neutral-100">{selectedProvider.name}</span>
                    <Badge tone="gold" className="text-[10px]">{selectedProvider.id}</Badge>
                  </div>

                  {/* OAuth Flow option */}
                  {(selectedProvider.oauth || ["antigravity", "gemini", "claude", "codex", "openai"].includes(selectedProvider.id.toLowerCase())) && (
                    <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/60 space-y-2.5">
                      <div className="text-xs font-semibold text-neutral-200">{t("fast_oauth", language)}</div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        {t("oauth_desc", language)}
                      </p>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleOAuthSignIn}
                        disabled={connecting}
                        className="w-full gap-2 text-xs font-medium cursor-pointer"
                      >
                        <ExternalLink className="size-3.5" />
                        {connecting ? t("opening_browser", language) : `${t("login_with", language)} ${selectedProvider.name}`}
                      </Button>

                      {manualAuthUrl && (
                        <div className="mt-2 p-2 rounded bg-neutral-950 border border-neutral-800 text-[11px] font-mono space-y-1">
                          <div className="text-neutral-400">{t("manual_auth_url", language)}</div>
                          <div className="flex items-center gap-1">
                            <span className="truncate text-gold-300 flex-1">{manualAuthUrl}</span>
                            <button
                              onClick={copyManualAuthUrl}
                              className="p-1 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                              title="Copy Link"
                            >
                              {authUrlCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Manual Callback URL Redirect Input */}
                      <div className="mt-3 pt-3 border-t border-neutral-800/80 space-y-2">
                        <label className="text-[11px] font-semibold text-gold-400 flex items-center gap-1">
                          <Link className="size-3.5" />
                          {t("paste_callback_label", language)}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualCallbackUrl}
                            onChange={(e) => setManualCallbackUrl(e.target.value)}
                            placeholder={t("paste_callback_placeholder", language)}
                            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-gold-400 focus:outline-none font-mono"
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={handleCompleteManualCallback}
                            disabled={verifyingCallback || !manualCallbackUrl.trim()}
                            className="gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
                          >
                            {verifyingCallback ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                            {verifyingCallback ? t("verifying", language) : t("confirm_link", language)}
                          </Button>
                        </div>
                      </div>

                      {connectMessage && (
                        <div
                          className={cn(
                            "mt-3 p-3 rounded-xl text-xs font-medium border animate-fadeIn",
                            connectMessage.startsWith("✅")
                              ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-200"
                              : "bg-red-950/60 border-red-500/50 text-red-200",
                          )}
                        >
                          {connectMessage}
                        </div>
                      )}
                    </div>
                  )}

                  {/* API Key option */}
                  {(selectedProvider.apiKey || true) && (
                    <div className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/60 space-y-2.5">
                      <div className="text-xs font-semibold text-neutral-200">{t("config_via_apikey", language)}</div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={`${t("enter_apikey_placeholder", language)} (${selectedProvider.name})`}
                          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-gold-400 focus:outline-none font-mono"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={connectApiKey}
                          disabled={connecting || !apiKey.trim()}
                          className="gap-1.5 text-xs cursor-pointer shrink-0"
                        >
                          <KeyRound className="size-3.5 text-gold-400" />
                          {t("save_key", language)}
                        </Button>
                      </div>
                    </div>
                  )}

                  {connectMessage && (
                    <div className={cn(
                      "p-3 rounded-lg text-xs font-medium border",
                      connectMessage.includes("✅")
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-red-500/10 border-red-500/30 text-red-300"
                    )}>
                      {connectMessage}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-neutral-500">
                  Chọn một AI Provider ở danh sách bên trái để cấu hình kết nối.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}
