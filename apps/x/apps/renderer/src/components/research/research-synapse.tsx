interface SynapseNode {
  label: string;
  type: "query" | "subquestion" | "source";
  round?: number;
}

export function ResearchSynapse({
  progress,
}: {
  progress: { phase: string; round: number; totalRounds: number; sourcesFound: number };
}) {
  const { phase, round, sourcesFound } = progress;
  const cx = 150;
  const cy = 120;

  const nodes: SynapseNode[] = [
    { label: progress.phase === "planning" ? "Planning..." : "Query", type: "query" },
  ];

  if (round > 0) {
    const subCount = Math.min(round, 5);
    for (let i = 0; i < subCount; i++) {
      nodes.push({ label: `Round ${i + 1}`, type: "subquestion", round: i + 1 });
    }
  }

  const sourceCount = Math.min(sourcesFound, 8);
  for (let i = 0; i < sourceCount; i++) {
    nodes.push({ label: "", type: "source", round: Math.min(i + 1, round || 1) });
  }

  return (
    <svg width="260" height="200" viewBox="0 0 260 200" className="shrink-0">
      {/* Central node */}
      <circle cx={cx} cy={cy} r="18" fill="hsl(var(--primary))" opacity="0.9" />
      <text x={cx} y={cy + 1} textAnchor="middle" fill="white" fontSize="8" fontWeight="600">
        {(phase === "planning" || phase === "finalizing") ? (phase === "finalizing" ? "✍" : "?" ) : round > 0 ? `R${round}` : "..."}
      </text>

      {/* Sub-question branches */}
      {nodes.filter(n => n.type === "subquestion").map((node, i) => {
        const angle = (i / Math.max(nodes.filter(n => n.type === "subquestion").length, 1)) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(angle) * 45;
        const ny = cy + Math.sin(angle) * 35;
        const isActive = node.round === round;
        return (
          <g key={`sq-${i}`}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--primary))" strokeWidth="1" opacity={isActive ? 0.6 : 0.2} />
            <circle cx={nx} cy={ny} r="5" fill={isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} opacity={isActive ? 0.8 : 0.3} />
            <text x={nx} y={ny + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="6">
              R{node.round}
            </text>
          </g>
        );
      })}

      {/* Source leaf nodes */}
      {nodes.filter(n => n.type === "source").map((_node, i) => {
        const angle = (i / Math.max(nodes.filter(n => n.type === "source").length, 1)) * Math.PI * 2 + Math.PI / 4;
        const nx = cx + Math.cos(angle) * 75;
        const ny = cy + Math.sin(angle) * 60;
        return (
          <g key={`src-${i}`}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.15" />
            <circle cx={nx} cy={ny} r="3" fill="hsl(var(--primary))" opacity="0.4" />
          </g>
        );
      })}

      {/* Phase label */}
      <text x={cx} y={cy + 38} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontWeight="500">
        {phase === "planning" ? "Planning" :
         phase === "searching" ? "Searching" :
         phase === "extracting" ? "Extracting" :
         phase === "synthesizing" ? "Synthesizing" :
         phase === "deciding" ? "Evaluating" :
         phase === "finalizing" ? "Finalizing" : phase}
      </text>
    </svg>
  );
}
