import { useState } from "react"
import { Plus, X, ArrowLeft, BookOpen } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { OnboardingState } from "../use-onboarding-state"

interface CoursesStepProps {
  state: OnboardingState
}

const DEMO_COURSES = [
  "Biology 101",
  "Introduction to Psychology",
  "Calculus I",
  "English Composition",
]

export function CoursesStep({ state }: CoursesStepProps) {
  const { courses, courseInput, setCourseInput, addCourse, removeCourse, handleNext, handleBack } = state
  const [inputValue, setInputValue] = useState(courseInput)

  const handleAdd = () => {
    if (inputValue.trim()) {
      addCourse(inputValue.trim())
      setInputValue("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  const handleDemoClick = (name: string) => {
    addCourse(name)
  }

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
          What are you studying?
        </h2>
        <p className="text-base text-muted-foreground">
          Add your courses to get started. You can add more later.
        </p>
      </motion.div>

      {/* Add course input */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2 mb-6"
      >
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Biology 101"
          className="h-10"
        />
        <Button onClick={handleAdd} disabled={!inputValue.trim()} className="shrink-0">
          <Plus className="size-4 mr-1" />
          Add Course
        </Button>
      </motion.div>

      {/* Course list */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="min-h-[80px] mb-6"
      >
        {courses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {courses.map((course, i) => (
              <motion.span
                key={course.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
                style={{
                  borderColor: course.color,
                  backgroundColor: `${course.color}14`,
                  color: course.color,
                }}
              >
                {course.name}
                <button
                  onClick={() => removeCourse(course.id)}
                  className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[80px] rounded-2xl border border-dashed border-border">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <BookOpen className="size-8 opacity-30" />
              <span className="text-sm">No courses added yet</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* Demo courses */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-6"
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Suggestions
        </div>
        <div className="flex flex-wrap gap-2">
          {DEMO_COURSES.filter(
            (demo) => !courses.some((c) => c.name.toLowerCase() === demo.toLowerCase()),
          ).map((demo) => (
            <button
              key={demo}
              onClick={() => handleDemoClick(demo)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Plus className="size-3" />
              {demo}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="flex items-center justify-between border-t mt-auto pt-6"
      >
        <Button variant="ghost" onClick={handleBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={courses.length === 0}
          size="lg"
          className="text-base font-medium"
        >
          Continue
        </Button>
      </motion.div>
    </div>
  )
}
