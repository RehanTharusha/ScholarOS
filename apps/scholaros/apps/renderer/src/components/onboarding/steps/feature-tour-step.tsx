import { MessageSquare, Network, FileText, Calendar, ArrowLeft } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { OnboardingState } from "../use-onboarding-state"

interface FeatureTourStepProps {
  state: OnboardingState
}

const features = [
  {
    icon: MessageSquare,
    title: "AI Chat",
    description: "Ask questions about your notes, papers, and lectures",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Visualize connections between concepts",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    icon: FileText,
    title: "PDF Analysis",
    description: "Extract insights from research papers",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    icon: Calendar,
    title: "Calendar",
    description: "Schedule and track your academic events",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
]

export function FeatureTourStep({ state }: FeatureTourStepProps) {
  return (
    <div className="flex flex-col flex-1">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-8"
      >
        <h2 className="text-3xl font-bold tracking-tight mb-2">
          Discover ScholarOS
        </h2>
        <p className="text-base text-muted-foreground">
          Everything you need to supercharge your academic workflow
        </p>
      </motion.div>

      {/* Feature cards */}
      <div className="space-y-3 flex-1">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex items-center gap-4 rounded-2xl border bg-card p-5"
          >
            <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${feature.color}`}>
              <feature.icon className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold mb-0.5">{feature.title}</div>
              <div className="text-sm text-muted-foreground">{feature.description}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-between border-t mt-8 pt-6"
      >
        <Button variant="ghost" onClick={state.handleBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={state.handleNext} size="lg" className="text-base font-medium">
          Get Started
        </Button>
      </motion.div>
    </div>
  )
}
