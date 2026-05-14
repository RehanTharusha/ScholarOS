import { z } from "zod";

const IFRAME_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedIframeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol !== "http:") return false;
    return IFRAME_LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const ImageBlockSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export type ImageBlock = z.infer<typeof ImageBlockSchema>;

export const EmbedBlockSchema = z.object({
  provider: z.enum(["youtube", "figma", "generic"]),
  url: z.string().url(),
  caption: z.string().optional(),
});

export type EmbedBlock = z.infer<typeof EmbedBlockSchema>;

export const IframeBlockSchema = z.object({
  url: z.string().url().refine(isAllowedIframeUrl, {
    message:
      "Iframe URLs must use https:// or local http://localhost / 127.0.0.1.",
  }),
  title: z.string().optional(),
  caption: z.string().optional(),
  height: z.number().int().min(240).max(1600).optional(),
  allow: z.string().optional(),
});

export type IframeBlock = z.infer<typeof IframeBlockSchema>;

export const ChartBlockSchema = z.object({
  chart: z.enum(["line", "bar", "pie"]),
  title: z.string().optional(),
  data: z.array(z.record(z.string(), z.unknown())).optional(),
  source: z.string().optional(),
  x: z.string(),
  y: z.string(),
});

export type ChartBlock = z.infer<typeof ChartBlockSchema>;

export const TableBlockSchema = z.object({
  columns: z.array(z.string()),
  data: z.array(z.record(z.string(), z.unknown())),
  title: z.string().optional(),
});

export type TableBlock = z.infer<typeof TableBlockSchema>;

export const TranscriptBlockSchema = z.object({
  transcript: z.string(),
});

export type TranscriptBlock = z.infer<typeof TranscriptBlockSchema>;

export const SuggestedTopicBlockSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
  course: z.string().optional(),
});

export type SuggestedTopicBlock = z.infer<typeof SuggestedTopicBlockSchema>;
