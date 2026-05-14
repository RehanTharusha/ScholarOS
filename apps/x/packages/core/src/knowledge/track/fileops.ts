import z from 'zod';
import { TrackStateSchema } from './types.js';

export async function fetchAll(): Promise<z.infer<typeof TrackStateSchema>[]> {
    return [];
}
export async function fetch(): Promise<z.infer<typeof TrackStateSchema> | null> {
    return null;
}
export async function fetchYaml(): Promise<string | null> {
    return null;
}
export async function updateContent(): Promise<void> {}
export async function updateTrackBlock(): Promise<void> {}
export async function replaceTrackBlockYaml(): Promise<void> {}
export async function deleteTrackBlock(): Promise<void> {}
