import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FlaskConical, KeyRound, LoaderCircle, Lock, LogIn, Pencil, RefreshCw, RotateCcw, X } from "lucide-react";
import { vaultDelete, vaultIsSecure, vaultSet } from "@/runtime/vault";
import { useApp } from "@/lib/store";
import { getProvider, type ProviderId } from "@/lib/catalog";
import {
  captureGrokWebSsoCookie,
  deleteAiRouterConnection,
  getAiRouterConnections,
  getAiRouterProviderCatalog,
  saveAiRouterConnection,
  signInWithAiRouterCore,
  testAiRouterConnection,
  type AiRouterConnection,
  type AiRouterProvider,
} from "@/runtime/aiRouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LOCAL_AI_ACCOUNTS = [
  { id: "antigravity", name: "Gemini" },
  { id: "codex", name: "GPT" },
  { id: "claude", name: "Claude" },
  { id: "grok-cli", name: "Grok" },
] as const;

export function Settings() {
  const {
    user,
    resetApp,
    selfImprove,
    setSelfImprove,
    updateLocalUser,
    ensureLocalUser,
    clearLocalUser,
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
  const [connectionActionId, setConnectionActionId] = useState<string | null>(null);
  const [editingLocalUser, setEditingLocalUser] = useState(false);
  const [localUserName, setLocalUserName] = useState("");
  const [confirmingLocalLogout, setConfirmingLocalLogout] = useState(false);
  const [loggingOutLocalUser, setLoggingOutLocalUser] = useState(false);

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

  const connectSubscription = async (providerToConnect = selectedProvider) => {
    const oauthProvider = providerToConnect?.oauthProvider;
    if (!oauthProvider || !providerToConnect) return;
    const provider = providerToConnect;
    setConnecting(true);
    setConnectMessage(null);
    setManualAuthUrl(null);
    setManualCallbackUrl("");
    try {
      const result = await signInWithAiRouterCore(
        oauthProvider,
        setManualAuthUrl,
      );
      const accessToken = result.accessToken || result.apiKey;
      if (!accessToken && !result.apiKey) throw new Error("AI Router OAuth returned no usable credential.");
      const latestConnections = await getAiRouterConnections();
      const providerConnections = latestConnections.filter((connection) => connection.provider === provider.id);
      const identity = accountIdentity(result);
      const id = createConnectionId(provider.id);
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
      await saveAiRouterConnection({
        id,
        provider: provider.id,
        name: provider.name,
        label: provider.name,
        email: identity.email,
        accountLabel: identity.accountLabel,
        priority: providerConnections.length + 1,
        authType: "subscription",
        credentialRef: `ai-router:credential:${id}`,
      });
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
      setConnectMessage(
        testError
          ? `Authenticated and stored in Vault. Model test is unavailable: ${testError}`
          : "Authenticated, stored in Vault, and model access verified.",
      );
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
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

  const testConnection = async (connection: AiRouterConnection) => {
    setConnectionActionId(connection.id);
    setConnectionError(null);
    try {
      await testAiRouterConnection(connection.id);
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
      await refreshConnections();
    } finally {
      setConnectionActionId(null);
    }
  };

  const resetConnection = async (connection: AiRouterConnection) => {
    setConnectionActionId(connection.id);
    setConnectionError(null);
    try {
      await deleteAiRouterConnection(connection.id);
      if (connection.credentialRef) await vaultDelete(connection.credentialRef);
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionActionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-neutral-400">Simple by design.</p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-300">Account</h2>
        {user ? (
          <Card className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-lg font-bold text-neutral-950">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{user.name}</div>
              <div className="text-xs text-neutral-500">
                AI Router account · {user.providerLabel || getProvider(user.provider as ProviderId).name}
                {user.detail ? ` · ${user.detail}` : ""}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-neutral-600">
                <Lock className="size-3" />
                {vaultIsSecure()
                  ? "Connections stored in the encrypted App Vault"
                  : "Development preview storage"}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Badge tone="green">Local user</Badge>
              <Button size="sm" variant="ghost" title="Edit local profile" onClick={editLocalUser}>
                <Pencil className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Log out local user" onClick={() => setConfirmingLocalLogout(true)}>
                Log out
              </Button>
            </div>
            <div className="w-full border-t border-neutral-800 pt-3">
              <div className="mb-2 text-xs font-medium text-neutral-300">AI accounts</div>
              <div className="flex flex-wrap gap-2">
                {LOCAL_AI_ACCOUNTS.map((account) => {
                  const connected = localUserProvider === account.id;
                  return (
                    <Button
                      key={account.id}
                      size="sm"
                      variant={connected ? "secondary" : "ghost"}
                      onClick={() => void signInLocalAiAccount(account.id)}
                      disabled={connecting}
                    >
                      {connecting ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                      {connected ? `${account.name} connected` : `Sign in ${account.name}`}
                    </Button>
                  );
                })}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mt-3 flex flex-col gap-3">
            <div className="flex-1">
              <div className="font-semibold">Create your local user</div>
              <div className="text-xs text-neutral-500">
                Sign in with an AI account. Its profile creates this device-local user;
                a paid subscription is also connected to AI Router when available.
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
        {connectionError ? (
          <Card className="mt-3 text-sm text-amber-200">
            AI Router unavailable: {connectionError}
          </Card>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {connections.map((connection) => (
              <Card key={connection.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{connection.name || connection.provider}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {connection.email || connection.accountLabel || connection.id}
                    {connection.defaultModel ? ` · ${connection.defaultModel}` : ""}
                  </div>
                  {connection.lastError && <div className="mt-1 text-xs text-red-300">{connection.lastError}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge tone={connection.isActive === false ? "neutral" : connection.testStatus === "Verified" ? "green" : "gold"}>
                    {connection.isActive === false ? "Disabled" : connection.testStatus || "Pending test"}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Test connection"
                      onClick={() => void testConnection(connection)}
                      disabled={connectionActionId === connection.id}
                    >
                      {connectionActionId === connection.id ? <LoaderCircle className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Reset connection and remove its Vault credential"
                      onClick={() => void resetConnection(connection)}
                      disabled={connectionActionId === connection.id}
                    >
                      <RotateCcw className="size-4" /> Reset
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {!loadingConnections && connections.length === 0 && (
              <Card className="text-sm text-neutral-400 sm:col-span-2">
                No vendor account connected yet.
              </Card>
            )}
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
              {catalogError ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-red-300">
                  <span>{catalogError}</span>
                  <Button size="sm" variant="secondary" onClick={() => void refreshProviderCatalog()}>
                    <RefreshCw className="size-4" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="mt-3 grid max-h-[28rem] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {filteredProviders.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedProvider(item);
                        setApiKey("");
                        setConnectMessage(null);
                        setManualAuthUrl(null);
                        setManualCallbackUrl("");
                      }}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-800",
                        selectedProvider?.id === item.id && "bg-gold-400/10 text-gold-200",
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
              {selectedProvider && (
                <div className="mt-3 border-t border-neutral-800 pt-3 text-sm">
                  <div className="font-medium">{selectedProvider.name}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-500">{selectedProvider.id}</div>
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
                          placeholder="authorization code or http://localhost:443/callback?code=..."
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

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-300">About</h2>
        <Card className="mt-3 text-sm text-neutral-400">
          <div className="font-semibold text-neutral-100">
            V Assistant Desktop
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
              href="https://vuaai.net"
              target="_blank"
              rel="noreferrer"
              className="text-gold-300 hover:underline"
            >
              vuaai.net
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
