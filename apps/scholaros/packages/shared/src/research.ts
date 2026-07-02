import { z } from "zod";

export const ResearchCategory = z.enum([
  "literature-review",
  "compare-contrast",
  "methodology",
  "fact-check",
  "concept-exploration",
  "problem-solving",
]);
export type ResearchCategory = z.infer<typeof ResearchCategory>;

export const ResearchQuery = z.object({
  query: z.string().min(1),
  category: ResearchCategory.optional(),
  rounds: z.number().int().min(2).max(12).optional().default(6),
  model: z.string().optional(),
  provider: z.string().optional(),
});
export type ResearchQuery = z.infer<typeof ResearchQuery>;

export const ResearchProgress = z.object({
  phase: z.enum(["planning", "searching", "extracting", "synthesizing", "deciding", "finalizing"]),
  round: z.number(),
  totalRounds: z.number(),
  queriesFound: z.number(),
  sourcesFound: z.number(),
  findingsCount: z.number(),
  message: z.string().optional(),
});
export type ResearchProgress = z.infer<typeof ResearchProgress>;

export const ResearchSource = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string().optional(),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

export const ResearchFinding = z.object({
  url: z.string(),
  title: z.string(),
  summary: z.string(),
});
export type ResearchFinding = z.infer<typeof ResearchFinding>;

export const ResearchStats = z.object({
  duration: z.number(),
  rounds: z.number(),
  queries: z.number(),
  urls: z.number(),
  model: z.string(),
  searchProvider: z.string(),
  category: ResearchCategory,
});
export type ResearchStats = z.infer<typeof ResearchStats>;

export const ResearchSession = z.object({
  sessionId: z.string(),
  query: z.string(),
  status: z.enum(["running", "done", "error", "cancelled"]),
  category: ResearchCategory,
  progress: ResearchProgress.optional(),
  result: z.string().optional(),
  sources: z.array(ResearchSource),
  findings: z.array(ResearchFinding),
  stats: ResearchStats.optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});
export type ResearchSession = z.infer<typeof ResearchSession>;
