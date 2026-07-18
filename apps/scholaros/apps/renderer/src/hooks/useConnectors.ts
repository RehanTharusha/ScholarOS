import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// Safe accessor for window.ipc — returns undefined when running outside Electron
const getIpc = () =>
  typeof window !== "undefined" ? window.ipc : undefined;

export interface ProviderState {
  isConnected: boolean;
  isLoading: boolean;
  isConnecting: boolean;
}

export interface ProviderStatus {
  error?: string;
}

export function useConnectors(active: boolean) {
  const [providers, setProviders] = useState<string[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerStates, setProviderStates] = useState<
    Record<string, ProviderState>
  >({});
  const [providerStatus, setProviderStatus] = useState<
    Record<string, ProviderStatus>
  >({});


  // Load available providers on mount
  useEffect(() => {
    async function loadProviders() {
      try {
        setProvidersLoading(true);
        const result = await getIpc()?.invoke("oauth:list-providers", null);
        setProviders(result.providers || []);
      } catch (error) {
        console.error("Failed to get available providers:", error);
        setProviders([]);
      } finally {
        setProvidersLoading(false);
      }
    }
    loadProviders();
  }, []);

  // OAuth connect/disconnect
  const startConnect = useCallback(
    async (
      provider: string,
      credentials?: { clientId: string; clientSecret: string },
    ) => {
      setProviderStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], isConnecting: true },
      }));

      try {
        const result = await getIpc()?.invoke("oauth:connect", {
          provider,
          clientId: credentials?.clientId,
          clientSecret: credentials?.clientSecret,
        });

        if (!result.success) {
          toast.error(
            result.error ||
          (provider === "scholaros"
            ? "Failed to log in to ScholarOS"
                : `Failed to connect to ${provider}`),
          );
          setProviderStates((prev) => ({
            ...prev,
            [provider]: { ...prev[provider], isConnecting: false },
          }));
        }
      } catch (error) {
        console.error("Failed to connect:", error);
        toast.error(
          provider === "scholaros"
            ? "Failed to log in to ScholarOS"
            : `Failed to connect to ${provider}`,
        );
        setProviderStates((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], isConnecting: false },
        }));
      }
    },
    [],
  );

  const handleConnect = useCallback(
    async (provider: string) => {
      await startConnect(provider);
    },
    [startConnect],
  );

  const handleDisconnect = useCallback(async (provider: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], isLoading: true },
    }));

    try {
      const result = await getIpc()?.invoke("oauth:disconnect", { provider });

      if (result.success) {
        const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
        toast.success(
          provider === "scholaros"
            ? "Logged out of ScholarOS"
            : `Disconnected from ${displayName}`,
        );
        setProviderStates((prev) => ({
          ...prev,
          [provider]: {
            isConnected: false,
            isLoading: false,
            isConnecting: false,
          },
        }));
      } else {
        toast.error(
          provider === "scholaros"
            ? "Failed to log out of ScholarOS"
            : `Failed to disconnect from ${provider}`,
        );
        setProviderStates((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], isLoading: false },
        }));
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
        toast.error(
      provider === "scholaros"
        ? "Failed to log out of ScholarOS"
        : `Failed to disconnect from ${provider}`,
      );
      setProviderStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], isLoading: false },
      }));
    }
  }, []);

  // Refresh all statuses
  const refreshAllStatuses = useCallback(async () => {
    if (providers.length === 0) return;

    const newStates: Record<string, ProviderState> = {};

    try {
      const result = await getIpc()?.invoke("oauth:getState", null);
      const config = result.config || {};
      const statusMap: Record<string, ProviderStatus> = {};

      for (const provider of providers) {
        const providerConfig = config[provider];
        newStates[provider] = {
          isConnected: providerConfig?.connected ?? false,
          isLoading: false,
          isConnecting: false,
        };
        if (providerConfig?.error) {
          statusMap[provider] = { error: providerConfig.error };
        }
      }

      setProviderStatus(statusMap);
    } catch (error) {
      console.error("Failed to check connection statuses:", error);
      for (const provider of providers) {
        newStates[provider] = {
          isConnected: false,
          isLoading: false,
          isConnecting: false,
        };
      }
      setProviderStatus({});
    }

    setProviderStates(newStates);
  }, [providers]);

  // Refresh when active or providers change
  useEffect(() => {
    if (active) {
      refreshAllStatuses();
    }
  }, [active, providers, refreshAllStatuses]);

  // Listen for OAuth events
  useEffect(() => {
    const cleanup = getIpc()?.on("oauth:didConnect", async (event: { provider: string; success: boolean }) => {
      const { provider, success } = event;

      setProviderStates((prev) => ({
        ...prev,
        [provider]: {
          isConnected: success,
          isLoading: false,
          isConnecting: false,
        },
      }));

      if (success) {
        const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
        toast.success(`Connected to ${displayName}`);
        refreshAllStatuses();
      }
    });

    return cleanup;
  }, [refreshAllStatuses]);

  const hasProviderError = Object.values(providerStatus).some((status) =>
    Boolean(status?.error),
  );

  return {
    // OAuth providers
    providers,
    providersLoading,
    providerStates,
    providerStatus,
    hasProviderError,
    handleConnect,
    handleDisconnect,
    startConnect,

    // Refresh
    refreshAllStatuses,
  };
}
