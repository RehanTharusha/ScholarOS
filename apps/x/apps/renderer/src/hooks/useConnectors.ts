import { useState, useEffect, useCallback } from "react";
import {
  setGoogleCredentials,
  clearGoogleCredentials,
} from "@/lib/google-credentials-store";
import { toast } from "sonner";

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
  const [googleClientIdOpen, setGoogleClientIdOpen] = useState(false);
  const [googleClientIdDescription, setGoogleClientIdDescription] = useState<
    string | undefined
  >(undefined);

  // Composio API key state
  const [composioApiKeyOpen, setComposioApiKeyOpen] = useState(false);
  const [composioApiKeyTarget, setComposioApiKeyTarget] = useState<
    "slack" | "gmail"
  >("gmail");

  // Slack state
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackWorkspaces, setSlackWorkspaces] = useState<
    Array<{ url: string; name: string }>
  >([]);
  const [slackAvailableWorkspaces, setSlackAvailableWorkspaces] = useState<
    Array<{ url: string; name: string }>
  >([]);
  const [slackSelectedUrls, setSlackSelectedUrls] = useState<Set<string>>(
    new Set(),
  );
  const [slackPickerOpen, setSlackPickerOpen] = useState(false);
  const [slackDiscovering, setSlackDiscovering] = useState(false);
  const [slackDiscoverError, setSlackDiscoverError] = useState<string | null>(
    null,
  );

  // Load available providers on mount
  useEffect(() => {
    async function loadProviders() {
      try {
        setProvidersLoading(true);
        const result = await window.ipc.invoke("oauth:list-providers", null);
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

  // Slack
  const refreshSlackConfig = useCallback(async () => {
    try {
      setSlackLoading(true);
      const result = await window.ipc.invoke("slack:getConfig", null);
      setSlackEnabled(result.enabled);
      setSlackWorkspaces(result.workspaces || []);
    } catch (error) {
      console.error("Failed to load Slack config:", error);
      setSlackEnabled(false);
      setSlackWorkspaces([]);
    } finally {
      setSlackLoading(false);
    }
  }, []);

  const handleSlackEnable = useCallback(async () => {
    setSlackDiscovering(true);
    setSlackDiscoverError(null);
    try {
      const result = await window.ipc.invoke("slack:listWorkspaces", null);
      if (result.error || result.workspaces.length === 0) {
        setSlackDiscoverError(
          result.error ||
            "No Slack workspaces found. Set up with: agent-slack auth import-desktop",
        );
        setSlackAvailableWorkspaces([]);
        setSlackPickerOpen(true);
      } else {
        setSlackAvailableWorkspaces(result.workspaces);
        setSlackSelectedUrls(
          new Set(result.workspaces.map((w: { url: string }) => w.url)),
        );
        setSlackPickerOpen(true);
      }
    } catch (error) {
      console.error("Failed to discover Slack workspaces:", error);
      setSlackDiscoverError("Failed to discover Slack workspaces");
      setSlackPickerOpen(true);
    } finally {
      setSlackDiscovering(false);
    }
  }, []);

  const handleSlackSaveWorkspaces = useCallback(async () => {
    const selected = slackAvailableWorkspaces.filter((w) =>
      slackSelectedUrls.has(w.url),
    );
    try {
      setSlackLoading(true);
      await window.ipc.invoke("slack:setConfig", {
        enabled: true,
        workspaces: selected,
      });
      setSlackEnabled(true);
      setSlackWorkspaces(selected);
      setSlackPickerOpen(false);
      toast.success("Slack enabled");
    } catch (error) {
      console.error("Failed to save Slack config:", error);
      toast.error("Failed to save Slack settings");
    } finally {
      setSlackLoading(false);
    }
  }, [slackAvailableWorkspaces, slackSelectedUrls]);

  const handleSlackDisable = useCallback(async () => {
    try {
      setSlackLoading(true);
      await window.ipc.invoke("slack:setConfig", {
        enabled: false,
        workspaces: [],
      });
      setSlackEnabled(false);
      setSlackWorkspaces([]);
      setSlackPickerOpen(false);
      toast.success("Slack disabled");
    } catch (error) {
      console.error("Failed to update Slack config:", error);
      toast.error("Failed to update Slack settings");
    } finally {
      setSlackLoading(false);
    }
  }, []);

  // Composio API key
  const handleComposioApiKeySubmit = useCallback(async (apiKey: string) => {
    try {
      await window.ipc.invoke("composio:set-api-key", { apiKey });
      setComposioApiKeyOpen(false);
      toast.success("Composio API key saved");
    } catch (error) {
      console.error("Failed to save Composio API key:", error);
      toast.error("Failed to save API key");
    }
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
        const result = await window.ipc.invoke("oauth:connect", {
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
      if (provider === "google") {
        setGoogleClientIdDescription(undefined);
        setGoogleClientIdOpen(true);
        return;
      }

      await startConnect(provider);
    },
    [startConnect],
  );

  const handleGoogleClientIdSubmit = useCallback(
    (clientId: string, clientSecret: string) => {
      setGoogleCredentials(clientId, clientSecret);
      setGoogleClientIdOpen(false);
      setGoogleClientIdDescription(undefined);
      startConnect("google", { clientId, clientSecret });
    },
    [startConnect],
  );

  const handleDisconnect = useCallback(async (provider: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], isLoading: true },
    }));

    try {
      const result = await window.ipc.invoke("oauth:disconnect", { provider });

      if (result.success) {
        if (provider === "google") {
          clearGoogleCredentials();
        }
        const displayName =
          provider === "fireflies-ai"
            ? "Fireflies"
            : provider.charAt(0).toUpperCase() + provider.slice(1);
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
    refreshSlackConfig();

    if (providers.length === 0) return;

    const newStates: Record<string, ProviderState> = {};

    try {
      const result = await window.ipc.invoke("oauth:getState", null);
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
  }, [providers, refreshSlackConfig]);

  // Refresh when active or providers change
  useEffect(() => {
    if (active) {
      refreshAllStatuses();
    }
  }, [active, providers, refreshAllStatuses]);

  // Listen for OAuth events
  useEffect(() => {
    const cleanup = window.ipc.on("oauth:didConnect", async (event) => {
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
        const displayName =
          provider === "fireflies-ai"
            ? "Fireflies"
            : provider.charAt(0).toUpperCase() + provider.slice(1);
        if (provider === "scholaros") {
          toast.success("Logged in to ScholarOS");
        } else if (provider === "google" || provider === "fireflies-ai") {
          toast.success(`Connected to ${displayName}`, {
            description:
              "Syncing your data in the background. This may take a few minutes before changes appear.",
            duration: 8000,
          });
        } else {
          toast.success(`Connected to ${displayName}`);
        }

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

    // Google credentials modal
    googleClientIdOpen,
    setGoogleClientIdOpen,
    googleClientIdDescription,
    setGoogleClientIdDescription,
    handleGoogleClientIdSubmit,

    // Composio API key modal
    composioApiKeyOpen,
    setComposioApiKeyOpen,
    composioApiKeyTarget,
    setComposioApiKeyTarget,
    handleComposioApiKeySubmit,

    // Slack
    slackEnabled,
    slackLoading,
    slackWorkspaces,
    slackAvailableWorkspaces,
    slackSelectedUrls,
    setSlackSelectedUrls,
    slackPickerOpen,
    setSlackPickerOpen,
    slackDiscovering,
    slackDiscoverError,
    handleSlackEnable,
    handleSlackSaveWorkspaces,
    handleSlackDisable,

    // Refresh
    refreshAllStatuses,
  };
}
