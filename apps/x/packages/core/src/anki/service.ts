const ANKI_CONNECT_URL = "http://localhost:8765";

interface AnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

interface AnkiConnectResponse {
  result: unknown;
  error: string | null;
}

async function request(
  action: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const body: AnkiConnectRequest = { action, version: 6, params };
  const res = await fetch(ANKI_CONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AnkiConnect returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as AnkiConnectResponse;
  if (data.error) {
    throw new Error(`AnkiConnect error: ${data.error}`);
  }
  return data.result;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
  picture?: { url: string; filename: string; fields: string[] }[];
  audio?: { url: string; filename: string; fields: string[] }[];
}

export interface AnkiCanAddNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
}

export async function checkConnect(): Promise<boolean> {
  try {
    const result = await request("version");
    return typeof result === "number" && result >= 6;
  } catch {
    return false;
  }
}

export async function deckNames(): Promise<string[]> {
  return (await request("deckNames")) as string[];
}

export async function createDeck(deck: string): Promise<void> {
  await request("createDeck", { deck });
}

export async function modelNames(): Promise<string[]> {
  return (await request("modelNames")) as string[];
}

export async function modelFieldNames(modelName: string): Promise<string[]> {
  return (await request("modelFieldNames", { modelName })) as string[];
}

export async function addNote(note: AnkiNote): Promise<number> {
  return (await request("addNote", { note })) as number;
}

export async function addNotes(notes: AnkiNote[]): Promise<(number | null)[]> {
  return (await request("addNotes", { notes })) as (number | null)[];
}

export async function canAddNotes(
  notes: AnkiCanAddNote[],
): Promise<boolean[]> {
  return (await request("canAddNotes", { notes })) as boolean[];
}

export async function storeMediaFile(
  filename: string,
  data: string,
): Promise<void> {
  await request("storeMediaFile", { filename, data });
}

export async function findNotes(query: string): Promise<number[]> {
  return (await request("findNotes", { query })) as number[];
}

export async function guiBrowse(query: string): Promise<void> {
  await request("guiBrowse", { query });
}

export async function guiStartCardReview(deckName: string): Promise<void> {
  await request("guiStartCardReview", { name: deckName });
}
