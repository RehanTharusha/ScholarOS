import { MessageSquare, Network, FileSearch } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useState } from "react"
import type { OnboardingState } from "../use-onboarding-state"

interface WelcomeStepProps {
  state: OnboardingState
}

const features = [
  {
    icon: MessageSquare,
    title: "AI Chat",
    description: "Ask questions about your notes, papers, and lectures",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Visualize connections between concepts",
  },
  {
    icon: FileSearch,
    title: "PDF Analysis",
    description: "Extract insights from research papers",
  },
]

export function WelcomeStep({ state }: WelcomeStepProps) {
  const [showSkipDialog, setShowSkipDialog] = useState(false)

  return (
    <div className="flex flex-col items-center text-center flex-1">
      {/* Logo with animated glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-6"
      >
        <motion.div
          animate={{
            opacity: [0.15, 0.3, 0.15],
            scale: [2.2, 2.5, 2.2],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 size-16 rounded-2xl bg-primary/10 blur-xl"
        />
        <img
          src="/logo-only.png"
          alt="ScholarOS"
          className="relative size-16"
        />
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-3xl font-bold tracking-tight mb-2"
      >
        Welcome to ScholarOS
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-base text-muted-foreground leading-relaxed max-w-sm mb-8"
      >
        Let's get you set up for studying.
      </motion.p>

      {/* Feature highlight cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-3 gap-3 w-full max-w-md mb-8"
      >
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            className="flex flex-col items-center gap-2.5 rounded-2xl border bg-card p-4 text-center"
          >
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <feature.icon className="size-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold mb-0.5">{feature.title}</div>
              <div className="text-xs text-muted-foreground leading-snug">{feature.description}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="w-full max-w-sm space-y-3"
      >
        <Button
          onClick={state.handleNext}
          size="lg"
          className="w-full h-12 text-base font-medium"
        >
          Get Started
        </Button>
      </motion.div>

      {/* Skip onboarding link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mt-6"
      >
        <button
          onClick={() => setShowSkipDialog(true)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50"
        >
          Skip onboarding
        </button>
      </motion.div>

      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't have an AI assistant configured. You can set everything up later in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { state.handleComplete(); }}>
              Skip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
