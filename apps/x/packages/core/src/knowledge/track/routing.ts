export interface ParsedTrack {
    trackId: string;
    filePath: string;
    eventMatchCriteria: string;
    instruction: string;
    active: boolean;
}

export async function findCandidates(): Promise<ParsedTrack[]> {
    return [];
}
