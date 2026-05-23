import { motion } from "motion/react";
import { Sun, BookOpen, Moon, Monitor, Type, TextSelect } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import type { OnboardingState } from "../use-onboarding-state";

interface AppearanceStepProps {
  state: OnboardingState;
}

function ThemeCard({
  label,
  icon: Icon,
  isSelected,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
      )}
    >
      <Icon className={cn("size-5", isSelected ? "text-primary" : "text-muted-foreground")} />
      <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-foreground")}>
        {label}
      </span>
    </button>
  );
}

function OptionButton({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-sm font-medium rounded-lg border-2 transition-all",
        isSelected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function AppearanceStep({ state }: AppearanceStepProps) {
  const { theme, setTheme, fontStyle, setFontStyle, fontSize, setFontSize } = useTheme();

  return (
    <div className="flex flex-col flex-1">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-1 space-y-8"
      >
        {/* Theme */}
        <div>
          <h2 className="text-lg font-semibold mb-1">Choose your theme</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Pick a color scheme that works for you
          </p>
          <div className="grid grid-cols-4 gap-2">
            <ThemeCard label="Light" icon={Sun} isSelected={theme === "light"} onClick={() => setTheme("light")} />
            <ThemeCard label="Paper" icon={BookOpen} isSelected={theme === "paper"} onClick={() => setTheme("paper")} />
            <ThemeCard label="Dark" icon={Moon} isSelected={theme === "dark"} onClick={() => setTheme("dark")} />
            <ThemeCard label="System" icon={Monitor} isSelected={theme === "system"} onClick={() => setTheme("system")} />
          </div>
        </div>

        {/* Typography */}
        <div>
          <h2 className="text-lg font-semibold mb-1">Typography</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Set your preferred font style and base size
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Type className="size-4 text-muted-foreground shrink-0" />
              <div className="flex flex-1 gap-2">
                <OptionButton label="Serif" isSelected={fontStyle === "serif"} onClick={() => setFontStyle("serif")} />
                <OptionButton label="Sans" isSelected={fontStyle === "sans"} onClick={() => setFontStyle("sans")} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TextSelect className="size-4 text-muted-foreground shrink-0" />
              <div className="flex flex-1 gap-2">
                <OptionButton label="Small" isSelected={fontSize === "small"} onClick={() => setFontSize("small")} />
                <OptionButton label="Medium" isSelected={fontSize === "medium"} onClick={() => setFontSize("medium")} />
                <OptionButton label="Large" isSelected={fontSize === "large"} onClick={() => setFontSize("large")} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between border-t mt-8 pt-6"
      >
        <Button variant="ghost" onClick={state.handleBack} className="text-sm">
          Back
        </Button>
        <Button onClick={state.handleNext} size="lg" className="text-base font-medium">
          Continue
        </Button>
      </motion.div>
    </div>
  );
}
