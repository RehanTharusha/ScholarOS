export interface CitationCheck {
  sentence: string;
  supported: boolean;
  source?: string;
  reason: string;
}

export interface CitationVerificationResult {
  checks: CitationCheck[];
  unsupportedClaims: string[];
  supportedClaims: string[];
}

export function verifyEssayCitations(
  essayText: string,
  sourceNames: string[] = [],
): CitationVerificationResult {
  const sentences = essayText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const checks: CitationCheck[] = sentences.map((sentence) => {
    const citationMatch = sentence.match(
      /\[\[([^\]]+)\]\]|\(([^)]+)\)|\[([^\]]+)\]/,
    );
    const sourceHint =
      citationMatch?.[1] || citationMatch?.[2] || citationMatch?.[3];
    const matchedSource = sourceNames.find((source) => {
      if (!sourceHint) return false;
      return (
        source.toLowerCase().includes(sourceHint.toLowerCase()) ||
        sourceHint.toLowerCase().includes(source.toLowerCase())
      );
    });

    if (citationMatch || matchedSource) {
      return {
        sentence,
        supported: true,
        source: matchedSource ?? sourceHint,
        reason: "Citation marker or source reference found.",
      };
    }

    const factualCue =
      /\b(is|are|was|were|causes|means|shows|demonstrates|proves|explains)\b/i.test(
        sentence,
      );
    if (factualCue) {
      return {
        sentence,
        supported: false,
        reason: "Potential factual claim without a citation marker.",
      };
    }

    return {
      sentence,
      supported: true,
      reason: "Opinion or low-risk statement.",
    };
  });

  return {
    checks,
    unsupportedClaims: checks
      .filter((check) => !check.supported)
      .map((check) => check.sentence),
    supportedClaims: checks
      .filter((check) => check.supported)
      .map((check) => check.sentence),
  };
}
