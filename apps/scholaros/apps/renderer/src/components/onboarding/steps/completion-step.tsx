import { CheckCircle2, ArrowRight, BookOpen } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import type { OnboardingState } from "../use-onboarding-state"

interface CompletionStepProps {
  state: OnboardingState
}

export function CompletionStep({ state }: CompletionStepProps) {
  const { courses, handleComplete, saveCourses } = state

  const handleGoToDashboard = async () => {
    await saveCourses()
    handleComplete()
  }

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
          You're ready!
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Your courses are set up. Let's start studying.
        </p>
      </motion.div>

      {/* Course cards */}
      {courses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-sm mb-6"
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Your Courses
          </div>
          <div className="grid gap-2">
            {courses.map((course, i) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.06 }}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left"
              >
                <div
                  className="size-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${course.color}18` }}
                >
                  <BookOpen className="size-4" style={{ color: course.color }} />
                </div>
                <div>
                  <div className="text-sm font-medium">{course.name}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action button */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-sm"
      >
        <Button
          onClick={handleGoToDashboard}
          size="lg"
          className="h-12 w-full text-base font-medium gap-2"
        >
          Go to Dashboard
          <ArrowRight className="size-4" />
        </Button>
      </motion.div>
    </div>
  )
}
