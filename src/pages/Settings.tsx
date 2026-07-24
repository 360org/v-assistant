import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, Download, ExternalLink, FlaskConical, FolderOpen, HardDrive, Info, KeyRound, LoaderCircle, Lock, LogIn, Pencil, Power, PowerOff, RefreshCw, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { vaultDelete, vaultGet, vaultIsSecure, vaultSet } from "@/runtime/vault";
import { checkAppUpdate, type AppUpdateInfo } from "@/runtime/updater";
import { useApp } from "@/lib/store";

import {
  AI_ROUTER_BASE_URL,
  captureGrokWebSsoCookie,
  deleteAiRouterConnection,
  getAiRouterConnections,
  getAiRouterProviderCatalog,
  saveAiRouterConnection,
  signInWithAiRouterCore,
  testAiRouterConnection,
  toggleAiRouterConnection,
  type AiRouterConnection,
  type AiRouterProvider,
} from "@/runtime/aiRouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openExternalUrl } from "@/components/MessageContent";
import { cn } from "@/lib/utils";

const LOCAL_AI_ACCOUNTS = [
  { id: "antigravity", name: "Gemini" },
  { id: "codex", name: "GPT" },
  { id: "claude", name: "Claude" },
  { id: "grok-cli", name: "Grok" },
] as const;

// Local profiles created by the earlier onboarding flow used the consumer
// provider IDs. AI Router uses its inherited provider IDs for the same login.
const LOCAL_ACCOUNT_PROVIDER_IDS: Record<string, readonly string[]> = {
  antigravity: ["antigravity", "gemini"],
  codex: ["codex", "chatgpt", "openai"],
  claude: ["claude"],
  "grok-cli": ["grok-cli", "grok", "xai"],
};

export function Settings() {
  const {
    user,
    resetApp,
    selfImprove,
    setSelfImprove,
    customDataPath,
    setCustomDataPath,
    updateLocalUser,
    ensureLocalUser,
    clearLocalUser,
    language,
    setLanguage,
    theme,
    setTheme,
    exportFullBackupData,
    importFullBackupData,
  } = useApp();
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
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);
  const [manualCallbackUrl, setManualCallbackUrl] = useState("");
  const [authUrlCopied, setAuthUrlCopied] = useState(false);
  const [connectionActionKey, setConnectionActionKey] = useState<string | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});
  const [editingLocalUser, setEditingLocalUser] = useState(false);
  const [localUserName, setLocalUserName] = useState("");
  const [confirmingLocalLogout, setConfirmingLocalLogout] = useState(false);
  const [loggingOutLocalUser, setLoggingOutLocalUser] = useState(false);
  const [dataPathInput, setDataPathInput] = useState(customDataPath || "~/.v-assistant/data");
  const [savedPathMsg, setSavedPathMsg] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const signInAttemptRef = useRef(0);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkAppUpdate();
      setUpdateInfo(info);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    void handleCheckUpdate();
  }, [handleCheckUpdate]);

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

  useEffect(() => {
    setDataPathInput(customDataPath || "~/.v-assistant/data");
  }, [customDataPath]);

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
    setSavedPathMsg("🔄 Đã khôi phục đường dẫn mặc định.");
    setTimeout(() => setSavedPathMsg(null), 4000);
  };

  const handleCopyDataPath = () => {
    const activePath = customDataPath || "~/.v-assistant/data";
    void navigator.clipboard.writeText(activePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const refreshConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      setConnections(await getAiRouterConnections());
      setConnectionError(null);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  const refreshProviderCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      setProviderCatalog(await getAiRouterProviderCatalog(signal));
      setCatalogError(null);
    } catch (error) {
      if (!signal?.aborted) setCatalogError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => { void refreshConnections(); }, [refreshConnections]);

  useEffect(() => {
    if (!showProviderManager || providerCatalog.length) return;
    const controller = new AbortController();
    void refreshProviderCatalog(controller.signal);
    return () => controller.abort();
  }, [showProviderManager, providerCatalog.length, refreshProviderCatalog]);

  const refreshAiRouter = async () => {
    setConnectMessage(null);
    await Promise.all([
      refreshConnections(),
      showProviderManager ? refreshProviderCatalog() : Promise.resolve(),
    ]);
  };

  const filteredProviders = providerCatalog.filter((item) =>
    `${item.name} ${item.id}`.toLowerCase().includes(providerQuery.trim().toLowerCase()),
  );

  const subscriptionProvider = selectedProvider?.oauthProvider;
  const deviceCodeSubscription = subscriptionProvider === "grok-cli";
  const selectedProviderConnections = selectedProvider
    ? connections.filter((connection) => connection.provider === selectedProvider.id && connection.isActive !== false)
    : [];
  // A Local User is authenticated by one AI account. Other AI Router
  // connections are vendor credentials, not additional Local User sign-ins.
  const localUserProvider = user?.provider;
  const isLocalAccountConnected = (accountId: string) => {
    const providerIds = LOCAL_ACCOUNT_PROVIDER_IDS[accountId] ?? [accountId];
    return providerIds.includes(localUserProvider ?? "")
      || connections.some((connection) => (
        connection.isActive !== false
        && providerIds.includes(connection.provider)
        && (!user?.connectionId || connection.id === user.connectionId)
      ));
  };

  const createConnectionId = (provider: string) => {
    const accountId = globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${provider}:${accountId}`;
  };

  const accountIdentity = (result: Awaited<ReturnType<typeof signInWithAiRouterCore>>) => {
    const providerData = result.providerSpecificData || {};
    const accountId = typeof providerData.chatgptAccountId === "string"
      ? providerData.chatgptAccountId
      : typeof providerData.userId === "string" ? providerData.userId : undefined;
    return {
      email: result.email,
      accountLabel: result.email || accountId,
    };
  };

  const resetVendorForm = () => {
    signInAttemptRef.current++;
    setSelectedProvider(null);
    setConnecting(false);
    setManualAuthUrl(null);
    setManualCallbackUrl("");
    setConnectMessage(null);
    setApiKey("");
  };

  const selectVendorForm = (provider: AiRouterProvider) => {
    signInAttemptRef.current++;
    setSelectedProvider(provider);
    setConnecting(false);
    setManualAuthUrl(null);
    setManualCallbackUrl("");
    setConnectMessage(null);
    setApiKey("");
  };

  const connectSubscription = async (providerToConnect = selectedProvider) => {
    const oauthProvider = providerToConnect?.oauthProvider;
    if (!oauthProvider || !providerToConnect) return;
    const provider = providerToConnect;
    const attemptId = signInAttemptRef.current + 1;
    signInAttemptRef.current = attemptId;
    setConnecting(true);
    setConnectMessage(null);
    setManualAuthUrl(null);
    setManualCallbackUrl("");
    try {
      const result = await signInWithAiRouterCore(
        oauthProvider,
        setManualAuthUrl,
      );
      if (attemptId !== signInAttemptRef.current) return;
      const accessToken = result.accessToken || result.apiKey;
      if (!accessToken && !result.apiKey) throw new Error("AI Router OAuth returned no usable credential.");
      const latestConnections = await getAiRouterConnections();
      if (attemptId !== signInAttemptRef.current) return;
      const providerConnections = latestConnections.filter((connection) => connection.provider === provider.id);
      const identity = accountIdentity(result);

      // Deduplicate: If connection with same provider and email already exists, update existing connection instead of duplicating!
      const existingConnection = providerConnections.find(
        (c) =>
          (identity.email && c.email?.toLowerCase().trim() === identity.email.toLowerCase().trim()) ||
          (identity.accountLabel && c.accountLabel?.toLowerCase().trim() === identity.accountLabel.toLowerCase().trim()),
      );
      const id = existingConnection ? existingConnection.id : createConnectionId(provider.id);

      await vaultSet(`ai-router:credential:${id}`, JSON.stringify({
        accessToken,
        apiKey: result.apiKey,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        email: result.email,
        projectId: result.projectId,
        expiresAt: typeof result.expiresIn === "number" ? Date.now() + result.expiresIn * 1000 : undefined,
        lastRefreshAt: result.lastRefreshAt,
        scope: result.scope,
        providerSpecificData: result.providerSpecificData,
      }));
      if (attemptId !== signInAttemptRef.current) return;
      await saveAiRouterConnection({
        id,
        provider: provider.id,
        name: provider.name,
        label: provider.name,
        email: identity.email,
        accountLabel: identity.accountLabel,
        priority: existingConnection ? existingConnection.priority : providerConnections.length + 1,
        authType: "subscription",
        credentialRef: `ai-router:credential:${id}`,
      });
      if (existingConnection && existingConnection.isActive === false) {
        await toggleAiRouterConnection(id, true);
      }
      if (attemptId !== signInAttemptRef.current) return;
      ensureLocalUser({
        name: identity.accountLabel || provider.name,
        provider: provider.id,
        providerLabel: provider.name,
        detail: identity.email,
        connectionId: id,
      });
      let testError: string | null = null;
      try {
        await testAiRouterConnection(id);
      } catch (error) {
        testError = error instanceof Error ? error.message : String(error);
      }
      setManualAuthUrl(null);
      setManualCallbackUrl("");
      setAuthUrlCopied(false);
      await refreshConnections();
      if (attemptId !== signInAttemptRef.current) return;
      setConnectMessage(
        testError
          ? `Authenticated and stored in Vault. Model test is unavailable: ${testError}`
          : "Authenticated, stored in Vault, and model access verified.",
      );
    } catch (error) {
      if (attemptId === signInAttemptRef.current) {
        setConnectMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (attemptId === signInAttemptRef.current) setConnecting(false);
    }
  };

  const editLocalUser = () => {
    setLocalUserName(user?.name ?? "");
    setEditingLocalUser(true);
  };

  const saveLocalUser = () => {
    updateLocalUser(localUserName);
    setEditingLocalUser(false);
  };

  const logoutLocalUser = async () => {
    if (!user) return;
    // A browser OAuth flow may still be waiting for a callback. Make its
    // eventual result inert before removing the local profile.
    signInAttemptRef.current += 1;
    setConnecting(false);
    setManualAuthUrl(null);
    setManualCallbackUrl("");
    setConnectMessage(null);
    setLoggingOutLocalUser(true);
    setConnectionError(null);
    try {
      const connection = user.connectionId
        ? connections.find((item) => item.id === user.connectionId)
        : connections.find((item) => item.provider === user.provider && item.isActive !== false);
      if (connection) {
        await deleteAiRouterConnection(connection.id);
        if (connection.credentialRef) await vaultDelete(connection.credentialRef);
      }
      clearLocalUser();
      setConfirmingLocalLogout(false);
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoggingOutLocalUser(false);
    }
  };

  const signInLocalAiAccount = async (providerId: string) => {
    setShowProviderManager(true);
    setProviderQuery("");
    setConnectMessage(null);
    let catalog = providerCatalog;
    if (!catalog.length) {
      try {
        catalog = await getAiRouterProviderCatalog();
        setProviderCatalog(catalog);
      } catch (error) {
        setConnectMessage(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const provider = catalog.find((item) => item.id === providerId);
    if (!provider?.oauthProvider) {
      setConnectMessage("This AI account is not available from the local AI Router.");
      return;
    }
    setSelectedProvider(provider);
    await connectSubscription(provider);
  };

  const copyManualAuthUrl = () => {
    if (!manualAuthUrl) return;
    void navigator.clipboard.writeText(manualAuthUrl);
    setAuthUrlCopied(true);
    window.setTimeout(() => setAuthUrlCopied(false), 2000);
  };

  const submitManualCallback = () => {
    try {
      const rawValue = manualCallbackUrl.trim();
      if (!rawValue) throw new Error("Paste a callback URL or authorization code.");

      let code = rawValue;
      let callbackUrl: URL | null = null;

      if (/^https?:\/\//i.test(rawValue)) {
        callbackUrl = new URL(rawValue);
        const error = callbackUrl.searchParams.get("error");
        if (error) {
          setConnectMessage(callbackUrl.searchParams.get("error_description") || error);
          return;
        }
        code = callbackUrl.searchParams.get("code") || callbackUrl.searchParams.get("token") || rawValue;
      }

      if (!code) throw new Error("Paste a callback URL or authorization code.");
      const channel = new BroadcastChannel("v_assistant_oauth");
      setConnectMessage("Completing subscription sign-in...");
      channel.postMessage({
        code,
        state: callbackUrl?.searchParams.get("state"),
        fullUrl: callbackUrl?.toString(),
      });
      channel.close();
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const connectApiKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      const latestConnections = await getAiRouterConnections();
      const providerConnections = latestConnections.filter((connection) => connection.provider === selectedProvider.id);
      const id = createConnectionId(selectedProvider.id);
      await vaultSet(`ai-router:credential:${id}`, JSON.stringify({ apiKey: apiKey.trim() }));
      await saveAiRouterConnection({
        id,
        provider: selectedProvider.id,
        name: selectedProvider.name,
        label: selectedProvider.name,
        accountLabel: `API key ${providerConnections.length + 1}`,
        priority: providerConnections.length + 1,
        authType: "api-key",
        credentialRef: `ai-router:credential:${id}`,
      });
      await testAiRouterConnection(id);
      setApiKey("");
      setConnectMessage("API key stored in Vault and verified. AI Router loaded this vendor's models.");
      await refreshConnections();
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  };

  const saveSubscriptionCookie = async (cookieValue: string) => {
    if (!selectedProvider) return;
    const latestConnections = await getAiRouterConnections();
    const providerConnections = latestConnections.filter((connection) => connection.provider === selectedProvider.id);
    const id = createConnectionId(selectedProvider.id);
    await vaultSet(`ai-router:credential:${id}`, JSON.stringify({ apiKey: cookieValue.trim() }));
    await saveAiRouterConnection({
      id,
      provider: selectedProvider.id,
      name: selectedProvider.name,
      label: selectedProvider.name,
      priority: providerConnections.length + 1,
      authType: "subscription",
      credentialRef: `ai-router:credential:${id}`,
    });
    await testAiRouterConnection(id);
  };

  const connectSubscriptionCookie = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      await saveSubscriptionCookie(apiKey);
      setApiKey("");
      setConnectMessage("Subscription session stored in Vault and verified.");
      await refreshConnections();
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  };

  const captureSubscriptionCookie = async () => {
    if (!selectedProvider) return;
    setConnecting(true);
    setConnectMessage("Opening Grok. Sign in there if needed; V Assistant will capture the sso session.");
    try {
      const cookie = await captureGrokWebSsoCookie();
      await saveSubscriptionCookie(cookie);
      setApiKey("");
      setConnectMessage("Grok Web session captured, stored in Vault and verified.");
      await refreshConnections();
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  };

  const renewConnectionToken = async (connection: AiRouterConnection) => {
    setConnectionActionKey(`renew:${connection.id}`);
    setConnectionError(null);
    try {
      const vaultKey = `ai-router:credential:${connection.id}`;
      const credRaw = await vaultGet(vaultKey);
      let cred: { apiKey?: string; refreshToken?: string } = {};
      if (credRaw) {
        try {
          cred = JSON.parse(credRaw);
        } catch {
          cred = { apiKey: credRaw };
        }
      }

      let renewed = false;
      const provider = connection.provider || connection.id.split("-")[0];

      if (cred.refreshToken) {
        try {
          const refreshRes = await fetch(`${AI_ROUTER_BASE_URL}/oauth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              refreshToken: cred.refreshToken,
            }),
          });
          if (refreshRes.ok) {
            const payload = (await refreshRes.json()) as { tokens?: { apiKey?: string; accessToken?: string; refreshToken?: string } };
            const newKey = payload.tokens?.apiKey || payload.tokens?.accessToken;
            if (newKey) {
              const updatedCred = {
                ...cred,
                apiKey: newKey,
                ...(payload.tokens?.refreshToken ? { refreshToken: payload.tokens.refreshToken } : {}),
              };
              await vaultSet(vaultKey, JSON.stringify(updatedCred));
              renewed = true;
            }
          }
        } catch (e) {
          console.warn("Silent OAuth refresh failed, falling back to interactive renew:", e);
        }
      }

      if (!renewed) {
        if (provider === "xai" || connection.id.includes("grok")) {
          const cookie = await captureGrokWebSsoCookie();
          await vaultSet(vaultKey, JSON.stringify({ ...cred, apiKey: cookie.trim() }));
          renewed = true;
        } else {
          const tokens = await signInWithAiRouterCore(provider, (manualUrl) => {
            setConnectionError(`Vui lòng xác thực OAuth tại trình duyệt để làm mới Token: ${manualUrl}`);
          });
          const newKey = tokens.apiKey || tokens.accessToken;
          if (newKey) {
            const updatedCred = {
              ...cred,
              apiKey: newKey,
              ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
            };
            await vaultSet(vaultKey, JSON.stringify(updatedCred));
            renewed = true;
          }
        }
      }

      await testAiRouterConnection(connection.id);
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
      await refreshConnections();
    } finally {
      setConnectionActionKey(null);
    }
  };

  const testConnection = async (connection: AiRouterConnection) => {
    setConnectionActionKey(`test:${connection.id}`);
    setConnectionError(null);
    try {
      await testAiRouterConnection(connection.id);
      await refreshConnections();
    } catch (error) {
      let errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.toLowerCase().includes("expired") || errMsg.toLowerCase().includes("401") || errMsg.toLowerCase().includes("revoked")) {
        try {
          await renewConnectionToken(connection);
          return;
        } catch (renewErr) {
          errMsg = renewErr instanceof Error ? renewErr.message : String(renewErr);
        }
      }
      // Keep error confined to this specific account card instead of wiping the UI
      setConnections((prev) =>
        prev.map((c) => (c.id === connection.id ? { ...c, lastError: errMsg, testStatus: "Failed" } : c)),
      );
    } finally {
      setConnectionActionKey(null);
    }
  };

  const resetConnection = async (connection: AiRouterConnection) => {
    setConnectionActionKey(`reset:${connection.id}`);
    setConnectionError(null);
    try {
      await deleteAiRouterConnection(connection.id);
      if (connection.credentialRef) await vaultDelete(connection.credentialRef);
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionActionKey(null);
    }
  };

  const toggleConnectionState = async (connection: AiRouterConnection) => {
    setConnectionActionKey(`toggle:${connection.id}`);
    setConnectionError(null);
    try {
      const nextActive = connection.isActive === false;
      await toggleAiRouterConnection(connection.id, nextActive);
      setConnections((prev) =>
        prev.map((c) => (c.id === connection.id ? { ...c, isActive: nextActive } : c))
      );
      void refreshAiRouter();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionActionKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-neutral-400">Simple by design.</p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">Tài khoản & Thiết lập (Account & Preferences)</h2>
        {user ? (
          <Card className="mt-2.5 flex flex-col gap-4 p-4.5">
            {/* Row 1: Profile Identity */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-lg font-bold text-neutral-950 shadow-md ring-2 ring-gold-400/20">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-extrabold text-sm text-neutral-100">{user.name}</span>
                    <Badge tone="green" className="text-[10px] px-2 py-0.2 font-semibold">Local Profile</Badge>
                  </div>
                  <div className="text-xs text-neutral-400 truncate mt-0.5">
                    {user.detail ? user.detail : "Local App Profile"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500 font-mono">
                    <Lock className="size-3 text-emerald-400" />
                    {vaultIsSecure() ? "Encrypted App Vault" : "Development preview storage"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" title="Edit local profile" onClick={editLocalUser} className="h-8 px-3 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 border border-neutral-800">
                  <Pencil className="size-3.5" />
                  Đổi tên
                </Button>
                <Button size="sm" variant="ghost" title="Log out local user" onClick={() => setConfirmingLocalLogout(true)} className="h-8 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20">
                  Đăng xuất
                </Button>
              </div>
            </div>

            {/* Row 2: Fast Sign-in AI Accounts */}
            <div className="border-t border-neutral-800/70 pt-3.5">
              <div className="mb-2 text-xs font-semibold text-neutral-300">Kết nối nhanh tài khoản AI (Fast Sign-in)</div>
              <div className="flex flex-wrap gap-2">
                {LOCAL_AI_ACCOUNTS.map((account) => {
                  const connected = isLocalAccountConnected(account.id);
                  return (
                    <Button
                      key={account.id}
                      size="sm"
                      variant={connected ? "secondary" : "ghost"}
                      onClick={() => void signInLocalAiAccount(account.id)}
                      disabled={connecting}
                      className={cn(
                        "h-8 px-3 text-xs font-medium transition-all",
                        connected ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "text-neutral-300 hover:bg-neutral-800 border border-neutral-800"
                      )}
                    >
                      {connecting ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
                      {connected ? `${account.name} connected` : `Sign in ${account.name}`}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Preferences (Language & UI Theme) */}
            <div className="border-t border-neutral-800/70 pt-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Ngôn ngữ hiển thị (Language)</div>
                  <div className="text-[11px] text-neutral-400">Chọn ngôn ngữ mặc định cho giao diện ứng dụng</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setLanguage("vi")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      language === "vi"
                        ? "bg-gold-400/20 text-gold-300 border-gold-400/40 shadow-xs"
                        : "border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    )}
                  >
                    🇻🇳 Tiếng Việt
                  </button>
                  <button
                    onClick={() => setLanguage("en")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      language === "en"
                        ? "bg-gold-400/20 text-gold-300 border-gold-400/40 shadow-xs"
                        : "border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    )}
                  >
                    🇬🇧 English
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800/40 pt-2.5">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Chủ đề giao diện (UI Theme)</div>
                  <div className="text-[11px] text-neutral-400">Tùy biến phong cách màu sắc sang trọng</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      theme === "dark"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-xs"
                        : "border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    )}
                  >
                    🟢 Dark Emerald
                  </button>
                  <button
                    onClick={() => setTheme("gold")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      theme === "gold"
                        ? "bg-gold-400/20 text-gold-300 border-gold-400/40 shadow-xs"
                        : "border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    )}
                  >
                    🟡 Warm Gold
                  </button>
                  <button
                    onClick={() => setTheme("midnight")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      theme === "midnight"
                        ? "bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-xs"
                        : "border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    )}
                  >
                    🔵 Midnight Blue
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mt-2.5 flex flex-col gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">Tạo Local User Profile</div>
              <div className="text-xs text-neutral-500">
                Đăng nhập với bất kỳ tài khoản AI nào để khởi tạo hồ sơ cá nhân trên máy.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCAL_AI_ACCOUNTS.map((account) => (
                <Button key={account.id} size="sm" onClick={() => void signInLocalAiAccount(account.id)} disabled={connecting}>
                  {connecting ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                  Sign in {account.name}
                </Button>
              ))}
            </div>
          </Card>
        )}
      </section>

      {editingLocalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-label="Edit local profile" className="w-full max-w-sm border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Edit local profile</h2>
              <Button size="sm" variant="ghost" title="Close" onClick={() => setEditingLocalUser(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <label className="mt-4 block text-xs text-neutral-400" htmlFor="local-user-name">Display name</label>
            <input
              id="local-user-name"
              value={localUserName}
              onChange={(event) => setLocalUserName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveLocalUser();
              }}
              autoFocus
              className="mt-1 w-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingLocalUser(false)}>Cancel</Button>
              <Button size="sm" onClick={saveLocalUser} disabled={!localUserName.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {confirmingLocalLogout && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-label="Log out local user" className="w-full max-w-sm border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Log out {user.name}?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              This removes the AI account used to create this Local User from AI Router and deletes its credential from Vault. Other vendor connections stay connected.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmingLocalLogout(false)} disabled={loggingOutLocalUser}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={() => void logoutLocalUser()} disabled={loggingOutLocalUser}>
                {loggingOutLocalUser ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Log out
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-300">AI Router</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Connect vendor accounts here. Chat loads only models available from these connections.
            </p>
          </div>
          <button
            onClick={() => void refreshAiRouter()}
            title="Refresh AI Router connections"
            className="cursor-pointer rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <RefreshCw className={cn("size-4", loadingConnections && "animate-spin")} />
          </button>
        </div>
        {connectionError && (
          <Card className="mt-3 text-sm border-amber-500/30 bg-amber-500/10 text-amber-200 flex items-center justify-between gap-3">
            <div>
              <span className="font-semibold">AI Router chưa sẵn sàng:</span> {connectionError}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void refreshConnections()}
              disabled={loadingConnections}
              className="shrink-0 h-7 px-2.5 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/40"
            >
              {loadingConnections ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Thử lại
            </Button>
          </Card>
        )}
        {/* Active Connections Grid */}
        <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {connections
            .filter((c) => c.isActive !== false)
            .map((connection) => (
              <div
                key={connection.id}
                className="flex flex-col justify-between gap-3 p-4 rounded-2xl border transition-all shadow-md border-neutral-800/80 bg-neutral-900/80 hover:border-neutral-700 hover:bg-neutral-900"
              >
                {/* Header: Name, Email & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-neutral-100 truncate">
                        {connection.name || connection.provider}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-400 truncate">
                      {connection.email || connection.accountLabel || connection.id}
                      {connection.defaultModel ? ` · ${connection.defaultModel}` : ""}
                    </div>
                  </div>
                  <Badge
                    tone={connection.testStatus === "Verified" ? "green" : "gold"}
                    className="shrink-0 font-medium text-xs"
                  >
                    {connection.testStatus || "Pending test"}
                  </Badge>
                </div>

                {/* Error message (If present) */}
                {connection.lastError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 font-mono leading-relaxed break-words flex flex-col gap-2">
                    <span>{connection.lastError}</span>
                    {connection.lastError.includes("http") && (
                      <button
                        onClick={() => {
                          const match = connection.lastError?.match(/(https?:\/\/[^\s<">]+)/);
                          if (match?.[1]) void openExternalUrl(match[1]);
                        }}
                        className="flex items-center gap-1.5 self-start rounded-lg border border-gold-500/40 bg-gold-400/15 px-2.5 py-1 text-[11px] font-semibold text-gold-300 hover:bg-gold-400/25 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="size-3 text-gold-400" /> Xác thực lại tại trình duyệt
                      </button>
                    )}
                  </div>
                )}

                {/* Bottom Row: Action Buttons */}
                <div className="flex items-center justify-end gap-1.5 pt-2.5 border-t border-neutral-800/80">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Tắt Provider (Tạm dừng khi hết token/hạn mức)"
                    onClick={() => void toggleConnectionState(connection)}
                    disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                    className="h-8 px-2.5 text-xs font-medium text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10"
                  >
                    {connectionActionKey === `toggle:${connection.id}` ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <PowerOff className="size-3.5" />
                    )}
                    Tắt
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Test connection"
                    onClick={() => void testConnection(connection)}
                    disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                    className="h-8 px-2.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                  >
                    {connectionActionKey === `test:${connection.id}` ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <FlaskConical className="size-3.5" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Làm mới OAuth Token"
                    onClick={() => void renewConnectionToken(connection)}
                    disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                    className="h-8 px-2.5 text-xs font-medium border border-gold-500/30 text-gold-300 hover:bg-gold-500/15"
                  >
                    {connectionActionKey === `renew:${connection.id}` ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Renew
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Reset connection"
                    onClick={() => void resetConnection(connection)}
                    disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                    className="h-8 px-2.5 text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    {connectionActionKey === `reset:${connection.id}` ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    Reset
                  </Button>
                </div>
              </div>
            ))}
          {!loadingConnections && connections.length === 0 && (
            <Card className="text-sm text-neutral-400 sm:col-span-2">
              No vendor account connected yet.
            </Card>
          )}
        </div>

        {/* Disabled Connections List View */}
        {connections.some((c) => c.isActive === false) && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <PowerOff className="size-3.5 text-amber-400" />
              <span>Provider Đã Tắt / Hết Token ({connections.filter((c) => c.isActive === false).length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {connections
                .filter((c) => c.isActive === false)
                .map((connection) => (
                  <div
                    key={connection.id}
                    className="flex flex-col gap-2 p-3 rounded-2xl border border-neutral-800/60 bg-neutral-950/70 opacity-80"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 flex items-center gap-2.5">
                        <Badge tone="neutral" className="shrink-0 text-[10px] px-2 py-0.5 font-medium bg-neutral-800 text-neutral-400">
                          Tắt (Bị ẩn)
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-neutral-200 truncate block">
                            {connection.name || connection.provider}
                          </span>
                          <span className="text-[11px] text-neutral-400 truncate block">
                            {connection.email || connection.accountLabel || connection.id}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Xem thông báo chi tiết"
                          onClick={() => setExpandedMessageIds(prev => ({ ...prev, [connection.id]: !prev[connection.id] }))}
                          className="h-7 px-2 text-xs font-medium text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                        >
                          <Info className="size-3 text-amber-400" />
                          {expandedMessageIds[connection.id] ? "Ẩn tin" : "Xem tin"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          title="Bật lại Provider này"
                          onClick={() => void toggleConnectionState(connection)}
                          disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                          className="h-7 px-2.5 text-xs font-semibold border border-gold-500/40 text-gold-300 hover:bg-gold-500/20"
                        >
                          {connectionActionKey === `toggle:${connection.id}` ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <Power className="size-3" />
                          )}
                          Bật lại
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Reset connection"
                          onClick={() => void resetConnection(connection)}
                          disabled={Boolean(connectionActionKey?.endsWith(`:${connection.id}`))}
                          className="h-7 px-2 text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-red-500/10"
                        >
                          {connectionActionKey === `reset:${connection.id}` ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3" />
                          )}
                          Reset
                        </Button>
                      </div>
                    </div>

                    {expandedMessageIds[connection.id] && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 font-medium flex items-center gap-1.5">
                          <span>⏸️ Provider đang TẮT (Hết token/chờ reset). AI Router tạm thời bỏ qua tài khoản này.</span>
                        </div>

                        {connection.lastError && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 font-mono leading-relaxed break-words flex flex-col gap-2">
                            <span>{connection.lastError}</span>
                            {connection.lastError.includes("http") && (
                              <button
                                onClick={() => {
                                  const match = connection.lastError?.match(/(https?:\/\/[^\s<">]+)/);
                                  if (match?.[1]) void openExternalUrl(match[1]);
                                }}
                                className="flex items-center gap-1.5 self-start rounded-lg border border-gold-500/40 bg-gold-400/15 px-2.5 py-1 text-[11px] font-semibold text-gold-300 hover:bg-gold-400/25 transition-colors cursor-pointer"
                              >
                                <ExternalLink className="size-3 text-gold-400" /> Xác thực lại tại trình duyệt
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
        <Button className="mt-3" variant="secondary" onClick={() => setShowProviderManager(true)}>
          <ExternalLink className="size-4" /> Connect or manage vendors
        </Button>
        {showProviderManager && (
          <div className="mt-4 border border-neutral-800 bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
              <span>AI Router Provider Manager</span>
              <button className="cursor-pointer text-gold-300 hover:text-gold-200" onClick={() => setShowProviderManager(false)}>Close</button>
            </div>
            <div className="p-3">
              <input
                value={providerQuery}
                onChange={(event) => setProviderQuery(event.target.value)}
                placeholder="Search a vendor"
                className="w-full border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
              />
              {selectedProvider && (
                <div className="mt-3 rounded-xl border border-gold-500/40 bg-neutral-900 p-3.5 text-sm shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-neutral-100">{selectedProvider.name}</span>
                      <span className="ml-2 font-mono text-xs text-neutral-500">({selectedProvider.id})</span>
                    </div>
                    <button
                      onClick={resetVendorForm}
                      className="cursor-pointer text-xs font-semibold text-neutral-400 hover:text-neutral-200"
                    >
                      ✕ Close form
                    </button>
                  </div>
                  {subscriptionProvider && (
                    <Button className="mt-3" size="sm" onClick={() => void connectSubscription()} disabled={connecting}>
                      {connecting ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                      {selectedProviderConnections.length ? "Add another account" : "Sign in with subscription"}
                    </Button>
                  )}
                  {selectedProviderConnections.length > 0 && (
                    <div className="mt-2 text-xs text-emerald-300">
                      {selectedProviderConnections.length} account{selectedProviderConnections.length === 1 ? "" : "s"} connected
                    </div>
                  )}
                  {selectedProvider.cookie && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-neutral-300">Connect Grok Web subscription</div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {selectedProvider.authHint || "Paste the subscription session cookie from the vendor website."}
                      </p>
                      <Button className="mt-2" size="sm" onClick={() => void captureSubscriptionCookie()} disabled={connecting}>
                        {connecting ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                        Open Grok & capture session
                      </Button>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          type="password"
                          placeholder="sso cookie"
                          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
                        />
                        <Button size="sm" onClick={() => void connectSubscriptionCookie()} disabled={connecting || !apiKey.trim()}>
                          <LogIn className="size-4" /> Connect subscription
                        </Button>
                      </div>
                    </div>
                  )}
                  {manualAuthUrl && !deviceCodeSubscription && (
                    <div className="mt-3 border border-neutral-800 bg-neutral-900 p-3">
                      <div className="text-xs font-medium text-neutral-300">Complete subscription sign-in</div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Follow the vendor sign-in page. If it shows a code, paste the code below. If it redirects to a local callback URL, paste the full URL below.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input
                          readOnly
                          value={manualAuthUrl}
                          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-950 px-2 py-2 font-mono text-xs text-neutral-400"
                        />
                        <Button className="w-8 px-0" size="sm" variant="secondary" onClick={copyManualAuthUrl} title="Copy sign-in URL">
                          {authUrlCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={manualCallbackUrl}
                          onChange={(event) => setManualCallbackUrl(event.target.value)}
                          placeholder="authorization code or http://localhost:1420/callback?code=..."
                          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs outline-none focus:border-gold-400/60"
                        />
                        <Button size="sm" variant="secondary" onClick={submitManualCallback} disabled={!manualCallbackUrl.trim()}>
                          Complete
                        </Button>
                      </div>
                    </div>
                  )}
                  {manualAuthUrl && deviceCodeSubscription && (
                    <div className="mt-3 border border-neutral-800 bg-neutral-900 p-3">
                      <div className="text-xs font-medium text-neutral-300">Complete Grok Build sign-in</div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Complete the approval in the browser window. V Assistant checks the device code automatically; no API key or pasted callback is needed.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input
                          readOnly
                          value={manualAuthUrl}
                          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-950 px-2 py-2 font-mono text-xs text-neutral-400"
                        />
                        <Button className="w-8 px-0" size="sm" variant="secondary" onClick={copyManualAuthUrl} title="Copy sign-in URL">
                          {authUrlCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                  {selectedProvider.apiKey && !selectedProvider.cookie && (
                    <details className="mt-3 border-t border-neutral-800 pt-3">
                      <summary className="cursor-pointer text-xs text-neutral-400">Advanced: connect with API key</summary>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          type="password"
                          placeholder={`${selectedProvider.name} API key`}
                          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
                        />
                        <Button size="sm" variant="secondary" onClick={() => void connectApiKey()} disabled={connecting || !apiKey.trim()}>
                          <KeyRound className="size-4" /> Save key
                        </Button>
                      </div>
                    </details>
                  )}
                  {!subscriptionProvider && !selectedProvider.apiKey && (
                    <p className="mt-3 text-xs text-neutral-500">
                      This provider has no browser OAuth flow in the inherited Core. Connect it through its supported API-key or local transport option.
                    </p>
                  )}
                  {connectMessage && (
                    <p className={cn("mt-3 text-xs", /authenticated|stored/i.test(connectMessage) ? "text-emerald-300" : "text-red-300")}>
                      {connectMessage}
                    </p>
                  )}
                </div>
              )}

              {catalogError ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-red-300">
                  <span>{catalogError}</span>
                  <Button size="sm" variant="secondary" onClick={() => void refreshProviderCatalog()}>
                    <RefreshCw className="size-4" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="mt-3 grid max-h-[22rem] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {filteredProviders.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectVendorForm(item)}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-800",
                        selectedProvider?.id === item.id && "bg-gold-400/10 text-gold-200 font-semibold border-l-2 border-gold-400",
                      )}
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 text-[10px] text-neutral-500">
                        {item.oauth && item.apiKey
                          ? "Subscription / API key"
                          : item.oauth || item.cookie ? "Subscription" : item.apiKey ? "API key" : "Provider"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">Assistant</h2>
        <Card className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Self-improving memory</div>
            <div className="text-xs text-neutral-500">
              Each role learns durable facts from your chats and saves them to
              its own memory — kept separate per role.
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



      {/* Task 4: Full Data Backup & Restore */}
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

      {/* Software Auto-Updater Section */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">
          🔄 Cập nhật Ứng dụng (Software Update)
        </h2>
        <Card className={cn(
          "mt-3 transition-all",
          updateInfo?.hasUpdate 
            ? "border-gold-400/50 bg-gradient-to-br from-gold-950/20 via-neutral-900 to-neutral-900" 
            : "border-neutral-800 bg-neutral-900/40"
        )}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-100">
                  Phiên bản hiện tại: v{__V_ASSISTANT_VERSION__}
                </span>
                {updateInfo?.hasUpdate ? (
                  <Badge tone="gold" className="animate-pulse gap-1">
                    <Sparkles className="size-3 text-gold-300" />
                    CÓ BẢN MỚI v{updateInfo.latestVersion}
                  </Badge>
                ) : (
                  <Badge tone="green" className="gap-1">
                    <CheckCircle2 className="size-3 text-emerald-400" />
                    Mới nhất
                  </Badge>
                )}
              </div>
              
              <p className="mt-1 text-xs text-neutral-400">
                {updateInfo?.hasUpdate
                  ? `Phát hiện bản phát hành mới v${updateInfo.latestVersion} từ GitHub Releases!`
                  : "Hệ thống sẽ tự động kiểm tra phiên bản mới nhất từ GitHub Releases."}
              </p>

              {updateInfo?.releaseNotes && updateInfo.hasUpdate && (
                <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-300">
                  <div className="font-medium text-gold-300 mb-1">📝 Nhật ký thay đổi (Release Notes):</div>
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
                {checkingUpdate ? "Đang kiểm tra..." : "Kiểm tra bản mới"}
              </Button>

              {updateInfo?.hasUpdate && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => updateInfo.downloadUrl && openExternalUrl(updateInfo.downloadUrl)}
                  className="gap-1.5 whitespace-nowrap cursor-pointer shadow-lg shadow-gold-500/10"
                >
                  <Download className="size-3.5" />
                  ⚡ Cập nhật tự động (Download DMG)
                </Button>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">About</h2>
        <Card className="mt-3 text-sm text-neutral-400">
          <div className="font-semibold text-neutral-100">
            Vua AI Assistant Desktop
          </div>
          <div className="mt-1">Version {__V_ASSISTANT_VERSION__}</div>
          <div className="mt-1">
            AI for everyone — install in 2 minutes, use immediately.
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-neutral-800 pt-3 text-xs">
            <span>
              Made by <span className="text-neutral-200">360org</span>
            </span>
            <a
              href="https://www.vuaai.net"
              target="_blank"
              rel="noreferrer"
              className="text-gold-300 hover:underline"
            >
              https://www.vuaai.net
            </a>
            <a
              href="mailto:support@vuaai.net"
              className="text-gold-300 hover:underline"
            >
              support@vuaai.net
            </a>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">Danger zone</h2>
        <Card className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Reset app</div>
            <div className="text-xs text-neutral-500">
              Clears chats, agents, knowledge and returns to setup.
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={resetApp}>
            Reset
          </Button>
        </Card>
      </section>
    </div>
  );
}
