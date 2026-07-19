"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectors } from "@/hooks/useConnectors";

interface ConnectedAccountsSettingsProps {
  dialogOpen: boolean;
}

export function ConnectedAccountsSettings({
  dialogOpen,
}: ConnectedAccountsSettingsProps) {
  const c = useConnectors(dialogOpen);

  const renderOAuthProvider = (
    provider: string,
    displayName: string,
    icon: React.ReactNode,
    description: string,
  ) => {
    const state = c.providerStates[provider] || {
      isConnected: false,
      isLoading: true,
      isConnecting: false,
    };
    const needsReconnect = Boolean(c.providerStatus[provider]?.error);

    return (
      <div
        key={provider}
        className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">{displayName}</span>
            {state.isLoading ? (
              <span className="text-xs text-muted-foreground">Checking...</span>
            ) : needsReconnect ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">Needs reconnect</span>
            ) : state.isConnected ? (
              <span className="text-xs text-emerald-600">Connected</span>
            ) : (
              <span className="text-xs text-muted-foreground truncate">
                {description}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {state.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : needsReconnect ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => c.startConnect(provider)}
              className="h-7 px-3 text-xs"
            >
              Reconnect
            </Button>
          ) : state.isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => c.handleDisconnect(provider)}
              className="h-7 px-3 text-xs"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => c.handleConnect(provider)}
              disabled={state.isConnecting}
              className="h-7 px-3 text-xs"
            >
              {state.isConnecting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                "Connect"
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (c.providersLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {c.providers.map((provider) =>
        renderOAuthProvider(
          provider,
          provider.charAt(0).toUpperCase() + provider.slice(1),
          <Loader2 className="size-4" />,
          "Manage connection",
        ),
      )}
    </div>
  );
}
