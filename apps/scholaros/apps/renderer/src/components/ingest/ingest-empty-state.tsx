"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AcademicEmptyState,
  AcademicCard,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BookOpen,
  FlaskConical,
  Library,
  Sparkles,
  Loader2,
  Check,
  ArrowRight,
  PenLine,
} from "lucide-react";

const TEMPLATES = [
  {
    id: "research",
    title: "Research",
    icon: FlaskConical,
    description: "Papers, articles, and findings",
    purpose:
      "I'm building a research knowledge base. Extract findings, methodologies, and connections between studies. Prioritize depth, cross-referencing, and tracing claims back to their sources.",
  },
  {
    id: "course",
    title: "Course",
    icon: BookOpen,
    description: "Lectures, notes, and study guides",
    purpose:
      "I'm organizing course materials. Build clear concept notes and study guides organized by topic. Prioritize clarity, learnability, and connections between related ideas.",
  },
  {
    id: "reading",
    title: "Reading",
    icon: Library,
    description: "Books, articles, and summaries",
    purpose:
      "I'm capturing insights from books and articles. Create a personal knowledge library with key ideas, quotes, and summaries. Make it easy to rediscover later.",
  },
  {
    id: "general",
    title: "General",
    icon: Sparkles,
    description: "Mixed materials and notes",
    purpose:
      "Build a flexible wiki from my materials. Focus on clear organization, useful cross-references, and making knowledge easy to find and connect.",
  },
];

interface IngestEmptyStateProps {
  onOpenFilePicker: () => void;
}

export function IngestEmptyState({ onOpenFilePicker }: IngestEmptyStateProps) {
  const [hasChecked, setHasChecked] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [purposeText, setPurposeText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [savedPurpose, setSavedPurpose] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    async function checkFirstRun() {
      try {
        const coursesRaw = await window.ipc.invoke("workspace:readFile", {
          path: ".scholar/courses.json",
        });
        if (cancelled) return;
        if (coursesRaw?.content) {
          const parsed = JSON.parse(coursesRaw.content);
          const hasCourses =
            Array.isArray(parsed.courses) && parsed.courses.length > 0;
          setIsFirstRun(!hasCourses);
          if (hasCourses) setShowOnboarding(false);
          setHasChecked(true);
        } else {
          setIsFirstRun(true);
          setHasChecked(true);
        }
      } catch {
        if (cancelled) return;
        setIsFirstRun(true);
        setHasChecked(true);
      }
    }

    checkFirstRun();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectTemplate = useCallback((id: string) => {
    setSelectedTemplate(id);
    const template = TEMPLATES.find((t) => t.id === id);
    if (template) setPurposeText(template.purpose);
  }, []);

  const handleSavePurpose = useCallback(async () => {
    if (!purposeText.trim()) {
      toast.error("Write a sentence or two about what you're building.");
      return;
    }

    setIsSaving(true);
    try {
      await window.ipc.invoke("workspace:writeFile", {
        path: "purpose.md",
        data: purposeText.trim(),
      });
      setSavedPurpose(true);
      toast.success("Purpose saved. Add your first files to start building your wiki.");

      // Wait a beat then transition away from onboarding
      setTimeout(() => {
        setShowOnboarding(false);
      }, 600);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to save purpose: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }, [purposeText]);

  if (!hasChecked) return null;

  // Onboarding for first-run users
  if (showOnboarding && isFirstRun) {
    const templateInfo = TEMPLATES.find((t) => t.id === selectedTemplate);

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="space-y-5"
      >
        {/* Step 1: Choose a template */}
        <AcademicCard>
          <AcademicSectionTitle
            eyebrow="Step 1 of 2"
            title="What kind of wiki are you building?"
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              const isSelected = selectedTemplate === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-150",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/20",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </AcademicCard>

        {/* Step 2: Purpose */}
        <AcademicCard className="relative">
          <AcademicSectionTitle
            eyebrow="Step 2 of 2"
            title="What's your goal?"
            count={purposeText.trim().length > 0 ? undefined : undefined}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Write a sentence or two about what you're building this wiki for.
            {templateInfo
              ? ` The "${templateInfo.title}" prefill is a starting point — edit freely.`
              : " Pick a template above or write your own."}
          </p>
          <div className="mt-4">
            <Textarea
              className="min-h-[100px] resize-y"
              placeholder={
                selectedTemplate
                  ? "Edit the purpose text above, or write your own..."
                  : "e.g., I'm studying for the MCAT biology section and need to organize lecture notes, textbook chapters, and practice problems."
              }
              value={purposeText}
              onChange={(e) => setPurposeText(e.target.value)}
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {savedPurpose ? (
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <Check className="size-3.5" />
                  Saved to <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">purpose.md</code>
                </span>
              ) : (
                <span>Your wiki will be shaped by this context.</span>
              )}
            </div>
            <Button
              onClick={handleSavePurpose}
              disabled={isSaving || savedPurpose}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : savedPurpose ? (
                <Check className="size-4" />
              ) : (
                <PenLine className="size-4" />
              )}
              {savedPurpose ? "Saved" : "Save & Start Adding Files"}
            </Button>
          </div>
        </AcademicCard>

        {/* Dismiss link for returning users who just want the drop zone */}
        <div className="text-center">
          <button
            onClick={() => setShowOnboarding(false)}
            className="text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Skip — I know what I'm doing
          </button>
        </div>
      </motion.div>
    );
  }

  // Simple empty state for returning users or after onboarding
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <AcademicEmptyState
        title={
          savedPurpose
            ? "Your purpose is set — drop files to begin"
            : "Drop course materials to begin"
        }
        description={
          savedPurpose
            ? "PDFs, slides, notes, images — add files above to start building your wiki."
            : "PDFs, slides, notes, images — drop them above and the AI will extract concepts, link related topics, and build a searchable knowledge wiki for you."
        }
        action={
          <Button onClick={onOpenFilePicker} variant="outline" className="gap-2">
            Browse files
            <ArrowRight className="size-4" />
          </Button>
        }
      />
    </motion.div>
  );
}

export default IngestEmptyState;
