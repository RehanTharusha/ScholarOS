import { ArrowLeft } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { OnboardingState } from "../use-onboarding-state"

interface ConnectAccountsStepProps {
  state: OnboardingState
}

export function ConnectAccountsStep({ state }: ConnectAccountsStepProps) {
  const { handleNext, handleBack } = state

  return (
    <div className="flex flex-col flex-1">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center py-8"
      >
        <h2 className="text-3xl font-bold tracking-tight mb-2">
          Connect Your Accounts
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed max-w-md">
          You can connect third-party accounts from the sidebar at any time.
        </p>
      </motion.div>

      <div className="flex flex-col gap-3 mt-8 pt-4 border-t">
        <Button onClick={handleNext} size="lg" className="h-12 text-base font-medium">
          Continue
        </Button>
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack} className="gap-1">
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button variant="ghost" onClick={handleNext} className="text-muted-foreground">
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
