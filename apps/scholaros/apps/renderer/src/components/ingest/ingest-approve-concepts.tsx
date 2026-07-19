"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Edit3, X } from "lucide-react";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ConceptData {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  related?: string[];
}

interface ContradictionData {
  id: string;
  claim1: string;
  source1: string;
  claim2: string;
  source2: string;
  confidence: number;
}

interface ApproveData {
  kind: "approve-concepts";
  sourceFiles: string[];
  suggestedCourse?: string;
  concepts: ConceptData[];
  contradictions: ContradictionData[];
}

interface IngestApproveConceptsProps {
  toolCallId: string;
  query: string;
  onResponse: (toolCallId: string, response: string) => void;
}

function parseApproveData(query: string): ApproveData | null {
  // Query format: [APPROVE_CONCEPTS]\n{...json...}
  const prefix = "[APPROVE_CONCEPTS]";
  const idx = query.indexOf(prefix);
  if (idx === -1) return null;
  const jsonPart = query.slice(idx + prefix.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (parsed.kind === "approve-concepts") return parsed as ApproveData;
    return null;
  } catch {
    return null;
  }
}

export function IngestApproveConcepts({
  toolCallId,
  query,
  onResponse,
}: IngestApproveConceptsProps) {
  const approveData = useMemo(() => parseApproveData(query), [query]);
  const lastQueryRef = useRef<string | undefined>(undefined);

  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [renamedTitles, setRenamedTitles] = useState<Record<string, string>>({});
  const [contradictionResolutions, setContradictionResolutions] = useState<
    Record<string, "both-valid" | "superseded" | "merged">
  >({});

  // Initialize approvedIds to all concept IDs when query changes
  useEffect(() => {
    if (approveData && query !== lastQueryRef.current) {
      lastQueryRef.current = query;
      setApprovedIds(new Set(approveData.concepts.map((c) => c.id)));
      setRenamedTitles({});
      setContradictionResolutions({});
    }
  }, [approveData, query]);

  const handleToggleConcept = useCallback((id: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRename = useCallback((id: string, title: string) => {
    setRenamedTitles((prev) => ({
      ...prev,
      [id]: title,
    }));
  }, []);

  const handleContradictionResolution = useCallback(
    (id: string, resolution: "both-valid" | "superseded" | "merged") => {
      setContradictionResolutions((prev) => ({
        ...prev,
        [id]: resolution,
      }));
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const removedIds: string[] = [];
    if (approveData) {
      for (const c of approveData.concepts) {
        if (!approvedIds.has(c.id)) {
          removedIds.push(c.id);
        }
      }
    }
    const approvedConceptIds = Array.from(approvedIds);

    const response = JSON.stringify({
      approvedConceptIds,
      renamedTitles,
      removedConceptIds: removedIds,
      contradictionResolutions,
    });

    onResponse(toolCallId, response);
    toast.success(`Approved ${approvedConceptIds.length} concept(s).`);
  }, [approvedIds, renamedTitles, contradictionResolutions, onResponse, toolCallId, approveData]);

  if (!approveData) {
    // Fallback: show the raw query text
    return (
      <AcademicCard>
        <AcademicSectionTitle eyebrow="Review" title="Agent needs your input" />
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {query}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            onClick={() => onResponse(toolCallId, "Approve all. Write the concepts as suggested.")}
          >
            Approve all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResponse(toolCallId, "Skip all. Do not write any concept pages.")}
          >
            Skip all
          </Button>
        </div>
      </AcademicCard>
    );
  }

  if (approveData.concepts.length === 0) {
    return (
      <AcademicCard className="border-amber-500/20 dark:border-amber-400/15">
        <AcademicSectionTitle eyebrow="Review" title="No concepts detected" />
        <p className="mt-2 text-sm text-muted-foreground">
          The source files were processed but no concepts were extracted.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            onClick={() => onResponse(toolCallId, "Skip all. Do not write any concept pages.")}
          >
            Skip — just write
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResponse(toolCallId, "Approve all. Write them as-is.")}
          >
            Write anyway
          </Button>
        </div>
      </AcademicCard>
    );
  }

  const selectedCount = approvedIds.size;
  const totalCount = approveData.concepts.length;
  const hasContradictions = approveData.contradictions.length > 0;

  return (
    <AcademicCard className="border-amber-500/20 dark:border-amber-400/15">
      <div className="flex items-start justify-between gap-4">
        <div>
          <AcademicSectionTitle eyebrow="Review" title="Approve concepts to create" />
          {approveData.suggestedCourse && (
            <p className="mt-1 text-xs text-muted-foreground">
              Course: <span className="font-medium">{approveData.suggestedCourse}</span>
            </p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0">
          {selectedCount}/{totalCount} selected
        </Badge>
      </div>

      {approveData.sourceFiles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {approveData.sourceFiles.map((f) => (
            <Badge key={f} variant="outline" className="text-[10px]">
              {f}
            </Badge>
          ))}
        </div>
      )}

      {/* Concept list */}
      <div className="mt-4 space-y-2">
        {approveData.concepts.map((concept) => {
          const isChecked = approvedIds.has(concept.id);
          const currentTitle = renamedTitles[concept.id] ?? concept.title;
          return (
            <div
              key={concept.id}
              className={`rounded-xl border px-4 py-3 transition-opacity ${
                isChecked
                  ? "border-border bg-muted/20"
                  : "border-dashed border-muted-foreground/20 opacity-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  className="mt-1 shrink-0 rounded border border-border p-1 text-muted-foreground transition-colors hover:border-primary hover:text-primary data-[checked=true]:border-primary data-[checked=true]:bg-primary/10 data-[checked=true]:text-primary"
                  data-checked={isChecked}
                  onClick={() => handleToggleConcept(concept.id)}
                  aria-label={isChecked ? `Remove ${concept.title}` : `Keep ${concept.title}`}
                >
                  {isChecked ? (
                    <CheckCircle className="size-4" />
                  ) : (
                    <X className="size-4" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  {isChecked ? (
                    <div className="flex items-center gap-2">
                      <Edit3 className="size-3 shrink-0 text-muted-foreground" />
                      <Input
                        value={currentTitle}
                        onChange={(e) => handleRename(concept.id, e.target.value)}
                        className="h-7 text-sm font-medium"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground line-through">
                      {currentTitle}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {concept.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] capitalize"
                    >
                      {concept.difficulty}
                    </Badge>
                    {concept.related?.map((r) => (
                      <Badge
                        key={r}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contradictions */}
      {hasContradictions && (
        <div className="mt-4">
          <AcademicSectionTitle eyebrow="Review" title="Contradictions to resolve" />
          <div className="mt-3 space-y-2">
            {approveData.contradictions.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-amber-500/20 dark:border-amber-400/15 bg-amber-500/5 dark:bg-amber-400/5 px-4 py-3"
              >
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-foreground">
                    {c.claim1}
                  </p>
                  <p className="text-muted-foreground">— {c.source1}</p>
                  <p className="font-medium text-foreground">vs</p>
                  <p className="font-medium text-foreground">
                    {c.claim2}
                  </p>
                  <p className="text-muted-foreground">— {c.source2}</p>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {(c.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  {(
                    ["both-valid", "superseded", "merged"] as const
                  ).map((option) => (
                    <button
                      key={option}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        contradictionResolutions[c.id] === option
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                      onClick={() => handleContradictionResolution(c.id, option)}
                    >
                      {option === "both-valid"
                        ? "Both valid"
                        : option === "superseded"
                          ? "Superseded"
                          : "Merged"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No contradictions */}
      {!hasContradictions && (
        <div className="mt-4">
          <AcademicEmptyState
            title="No contradictions detected"
            description="The materials appear consistent across sources."
          />
        </div>
      )}

      {/* Submit */}
      <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-4">
        <p className="text-xs text-muted-foreground">
          {totalCount - selectedCount > 0
            ? `${totalCount - selectedCount} concept(s) will be skipped`
            : "All concepts will be created"}
          {Object.keys(contradictionResolutions).length > 0 &&
            ` · ${Object.keys(contradictionResolutions).length} conflict(s) resolved`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onResponse(
                toolCallId,
                JSON.stringify({
                  approvedConceptIds: [],
                  renamedTitles: {},
                  removedConceptIds: approveData.concepts.map((c) => c.id),
                  contradictionResolutions: {},
                }),
              )
            }
          >
            Skip all — just write
          </Button>
          <Button onClick={handleSubmit} size="sm">
            Approve {selectedCount} of {totalCount} concepts
          </Button>
        </div>
      </div>
    </AcademicCard>
  );
}

export default IngestApproveConcepts;
