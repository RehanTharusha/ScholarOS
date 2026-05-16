import { ArrowLeft, FolderOpen, Loader2, Upload } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { OnboardingState } from "../use-onboarding-state"

interface CompletionStepProps {
  state: OnboardingState
}

export function CompletionStep({ state }: CompletionStepProps) {
  const { vaultPath, vaultLoading, handleVaultSelect, handleComplete, handleBack } = state
  const vaultName = vaultPath ? vaultPath.split(/[\\/]/).pop() : null

  const ingestSteps = [
    { icon: "📥", label: "Drop your materials", description: "Add PDFs, slides, or notes to the /raw folder in your vault." },
    { icon: "🤖", label: "Open your AI agent", description: "Point any AI coding agent (e.g. Claude Code, Cursor) at the vault folder." },
    { icon: "📚", label: 'Say: "Ingest /raw"', description: "The agent reads each file and builds your wiki in /knowledge." },
  ]

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          className="relative mb-6 inline-block"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.2, repeat: 2, ease: "easeOut" }}
            className="absolute inset-0 rounded-full bg-primary/20"
          />
          <div className="relative size-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="size-10 text-primary" />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-3xl font-bold tracking-tight mb-3"
        >
          Ready to learn
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto"
        >
          Your first ingest is where the magic starts. Here's how to build your wiki.
        </motion.p>
      </div>

      {/* Vault path */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-xl border bg-muted/30 p-4 mb-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Vault</div>
              <div className="text-sm font-medium truncate">
                {vaultName ?? <span className="text-muted-foreground italic">No vault selected</span>}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVaultSelect}
            disabled={vaultLoading}
            className="shrink-0"
          >
            {vaultLoading ? <Loader2 className="size-3.5 animate-spin" /> : "Change"}
          </Button>
        </div>
      </motion.div>

      {/* Ingest steps */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="space-y-3 mb-8"
      >
        {ingestSteps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.07 }}
            className="flex items-start gap-3 rounded-xl border p-3.5"
          >
            <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
              {step.icon}
            </div>
            <div>
              <div className="text-sm font-semibold">{step.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{step.description}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t">
        <Button variant="ghost" onClick={handleBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={handleComplete}
          size="lg"
          className="h-12 px-8 text-base font-medium"
        >
          Open ScholarOS
        </Button>
      </div>
    </div>
  )
}

