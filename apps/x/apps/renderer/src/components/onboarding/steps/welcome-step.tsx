import { Loader2, FolderOpen, BookOpen } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "../use-onboarding-state";

interface WelcomeStepProps {
  state: OnboardingState;
}

export function WelcomeStep({ state }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center flex-1">
      {/* Logo with ambient glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 size-16 rounded-2xl bg-primary/10 blur-xl scale-[2.5]" />
        <img
          src="/logo-only.png"
          alt="ScholarOS"
          className="relative size-16"
        />
      </motion.div>

      {/* Tagline badge */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground mb-6"
      >
        <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
        Your academic life, compiled
      </motion.div>

      {/* Main heading */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-bold tracking-tight mb-3"
      >
        Welcome to ScholarOS
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-base text-muted-foreground leading-relaxed max-w-sm mb-10"
      >
        Drop in a lecture PDF, a paper, or your class notes — the AI reads it,
        builds a structured wiki, and keeps everything linked and consistent.
      </motion.p>

      {/* Feature highlights */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-2 gap-3 w-full max-w-sm mb-10 text-left"
      >
        <div className="flex items-start gap-2.5 rounded-xl border bg-muted/30 p-3">
          <BookOpen className="size-4 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold">Wiki, not RAG</div>
            <div className="text-xs text-muted-foreground">Knowledge compiled once, kept current</div>
          </div>
        </div>
      </motion.div>

      {/* Primary actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs space-y-3"
      >
        <Button
          onClick={() => {
            state.setOnboardingPath("byok");
            state.setCurrentStep(1);
          }}
          size="lg"
          className="w-full h-12 text-base font-medium"
        >
          Set up AI model
        </Button>

        <Button
          onClick={state.handleVaultSelect}
          disabled={state.vaultLoading}
          variant="outline"
          size="lg"
          className="w-full h-12 text-base font-medium"
        >
          {state.vaultLoading ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Selecting…
            </>
          ) : (
            <>
              <FolderOpen className="size-4 mr-2" />
              {state.vaultPath ? `Vault: ${state.vaultPath.split(/[\\/]/).pop()}` : "Choose vault folder"}
            </>
          )}
        </Button>
      </motion.div>

      {/* Skip link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6"
      >
        <button
          onClick={() => state.setCurrentStep(1)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50"
        >
          Skip setup, get started
        </button>
      </motion.div>
    </div>
  );
}

