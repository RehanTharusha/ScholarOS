import {
  CheckCircle2,
  FolderOpen,
  Sparkles,
  Settings,
  ArrowRight,
} from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { OnboardingState } from "../use-onboarding-state"

interface CompletionStepProps {
  state: OnboardingState
  onNavigateToIngest?: () => void
}

export function CompletionStep({ state, onNavigateToIngest }: CompletionStepProps) {
  const { vaultPath, handleComplete } = state
  const vaultName = vaultPath ? vaultPath.split(/[\\\\/]/).pop() : null

  return (
    <div className="flex flex-col flex-1 items-center text-center">
      {/* Celebratory icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6"
      >
        <div className="relative inline-block">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="relative size-20 rounded-2xl bg-gradient-to-br from-green-400/20 to-green-500/5 flex items-center justify-center"
          >
            <CheckCircle2 className="size-10 text-green-600" />
          </motion.div>
        </div>
      </motion.div>

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <h2 className="text-3xl font-bold tracking-tight mb-2">
          You're all set!
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          ScholarOS is configured and ready to go. You can always adjust settings later.
        </p>
      </motion.div>

      {/* Settings summary card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-sm rounded-2xl border bg-card p-5 text-left mb-6"
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Configured Settings
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">AI Provider</div>
              <div className="text-xs text-muted-foreground capitalize">{state.llmProvider} configured</div>
            </div>
          </div>
          {vaultName && (
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <FolderOpen className="size-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">Vault</div>
                <div className="text-xs text-muted-foreground truncate">{vaultName}</div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Ingest prompt */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="w-full max-w-sm rounded-2xl border bg-card p-5 text-left mb-6"
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Next Step
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ingestion analyzes your PDFs, slides, and notes with AI to build a connected knowledge wiki. Your materials are extracted, structured into concept pages, and linked together automatically.
        </p>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="w-full max-w-sm space-y-3"
      >
        <Button
          onClick={() => {
            handleComplete()
            onNavigateToIngest?.()
          }}
          size="lg"
          className="h-12 w-full text-base font-medium gap-2"
        >
          Start Your First Ingest
          <ArrowRight className="size-4" />
        </Button>

        <button
          onClick={handleComplete}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Skip, explore on my own
        </button>
      </motion.div>

      {/* Footer hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mt-4"
      >
        <Button
          onClick={handleComplete}
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Settings className="size-3.5" />
          Open Settings
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          All settings can be accessed from the gear icon in the sidebar.
        </p>
      </motion.div>
    </div>
  )
}
