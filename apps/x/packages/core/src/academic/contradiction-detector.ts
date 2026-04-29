import { randomUUID } from "node:crypto";
import type { Contradiction } from "@x/shared/dist/academic.js";

interface LlmAgent {
  generate(prompt: string): Promise<{ text: string }>;
}

export interface ContradictionSource {
  name: string;
  content: string;
}

export class ContradictionDetector {
  constructor(private llmAgent: LlmAgent) {}

  async detect(sources: ContradictionSource[]): Promise<Contradiction[]> {
    if (sources.length < 2) return [];

    const prompt = `
Analyze these academic sources for contradictions.

${sources
  .map(
    (source) =>
      `Source: ${source.name}\nContent sample:\n${source.content.substring(0, 600)}`,
  )
  .join("\n\n")}

Return ONLY a JSON array with entries:
{
  "claim1": "claim from first source",
  "source1": "first source name",
  "claim2": "contradicting claim",
  "source2": "second source name",
  "conflictType": "factual|methodological|interpretive",
  "confidence": 0.0-1.0,
  "notes": "one sentence explanation"
}

If no contradictions are found, return [] exactly.
`;

    try {
      const response = await this.llmAgent.generate(prompt);
      const parsed = JSON.parse(response.text) as Array<
        Omit<Contradiction, "id" | "resolution">
      >;

      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => ({
        id: randomUUID(),
        claim1: item.claim1,
        source1: item.source1,
        claim2: item.claim2,
        source2: item.source2,
        conflictType: item.conflictType,
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0)),
        notes: item.notes,
      }));
    } catch {
      return [];
    }
  }
}
