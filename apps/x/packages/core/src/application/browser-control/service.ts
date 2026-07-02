import type { BrowserControlInput, BrowserControlResult } from '@scholaros/shared/dist/browser-control.js';

export interface IBrowserControlService {
  execute(
    input: BrowserControlInput,
    ctx?: { signal?: AbortSignal },
  ): Promise<BrowserControlResult>;
}
