import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void): () => void {
    return () => {};
}

function getSnapshot(): Map<string, unknown> {
    return new Map();
}

export function useTrackStatus(): Map<string, unknown> {
    return useSyncExternalStore(subscribe, getSnapshot);
}
