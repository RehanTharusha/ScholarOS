import { z } from 'zod';
import { useCallback, useEffect, useState } from 'react';
import { ScholarOSApiConfig } from '@x/shared/dist/rowboat-account.js';


interface ScholarOSAccountState {
  signedIn: boolean;
  accessToken: string | null;
  config: z.infer<typeof ScholarOSApiConfig> | null;
}

export type ScholarOSAccountSnapshot = ScholarOSAccountState;

const DEFAULT_STATE: ScholarOSAccountState = {
  signedIn: false,
  accessToken: null,
  config: null,
};

export function useScholarOSAccount() {
  const [state, setState] = useState<ScholarOSAccountState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = useCallback(async (): Promise<ScholarOSAccountSnapshot | null> => {
    try {
      setIsLoading(true);
      const result = await window.ipc.invoke('account:getAccount', null);
      const next: ScholarOSAccountSnapshot = {
        signedIn: result.signedIn,
        accessToken: result.accessToken,
        config: result.config,
      };
      setState(next);
      return next;
    } catch (error) {
      console.error('Failed to load ScholarOS account state:', error);
      setState(DEFAULT_STATE);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const cleanup = window.ipc.on('oauth:didConnect', (event) => {
      if (event.provider !== 'scholaros') {
        return;
      }
      refresh();
    });
    return cleanup;
  }, [refresh]);

  return {
    signedIn: state.signedIn,
    accessToken: state.accessToken,
    config: state.config,
    isLoading,
    refresh,
  };
}
