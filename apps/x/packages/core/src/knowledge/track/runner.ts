export interface TrackUpdateResult {
    trackId: string;
    runId: string | null;
    action: 'replace' | 'no_update';
    contentBefore: string | null;
    contentAfter: string | null;
    summary: string | null;
    error?: string;
}

export async function triggerTrackUpdate(
    trackId: string,
): Promise<TrackUpdateResult> {
    return { trackId, runId: null, action: 'no_update', contentBefore: null, contentAfter: null, summary: null };
}
