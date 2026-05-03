import { Loader2, CheckCircle2, FolderOpen } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OnboardingState } from "../use-onboarding-state";
import { useState, useEffect } from "react";

interface WelcomeStepProps {
  state: OnboardingState;
}

export function WelcomeStep({ state }: WelcomeStepProps) {
  const rowboatState = state.providerStates["rowboat"] || {
    isConnected: false,
    isLoading: false,
    isConnecting: false,
  };

  const [userName, setUserName] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(true);

  // Check localStorage on mount to see if user already provided a name or skipped
  useEffect(() => {
    const hasShownPrompt = localStorage.getItem("rowboat-name-prompt-shown");
    if (hasShownPrompt !== null) {
      // User already saw the prompt (either provided name or skipped)
      setShowNamePrompt(false);
    }
  }, []);

  const handleNameSubmit = () => {
    if (userName.trim()) {
      localStorage.setItem("rowboat-user-name", userName.trim());
    }
    localStorage.setItem("rowboat-name-prompt-shown", "true");
    setShowNamePrompt(false);
  };

  const handleSkip = () => {
    localStorage.removeItem("rowboat-user-name");
    localStorage.setItem("rowboat-name-prompt-shown", "true");
    setShowNamePrompt(false);
  };

  if (showNamePrompt) {
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
            alt="Rowboat"
            className="relative size-16"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold tracking-tight mb-3"
        >
          What should we call you?
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-base text-muted-foreground leading-relaxed max-w-sm mb-6"
        >
          (dw we don't save this info)
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-xs space-y-3"
        >
          <Input
            type="text"
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            className="text-center"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              onClick={handleNameSubmit}
              size="lg"
              className="flex-1 h-12 text-base font-medium"
            >
              Continue
            </Button>
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50 w-full"
          >
            Skip
          </button>
        </motion.div>
      </div>
    );
  }

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
        <img src="/logo-only.png" alt="Rowboat" className="relative size-16" />
      </motion.div>

      {/* Tagline badge */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground mb-6"
      >
        <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
        Your AI coworker, with memory
      </motion.div>

      {/* Main heading */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-bold tracking-tight mb-3"
      >
        Welcome to Rowboat
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-base text-muted-foreground leading-relaxed max-w-sm mb-10"
      >
        Rowboat connects to your work, builds a knowledge graph, and uses that
        context to help you get things done. Private and on your machine.
      </motion.p>

      {/* Sign in / connected state */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs"
      >
        {rowboatState.isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">Connected to Rowboat</span>
            </div>
            <Button
              onClick={() => {
                state.setOnboardingPath("rowboat");
                state.setCurrentStep(2);
              }}
              size="lg"
              className="w-full h-12 text-base font-medium"
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={() => {
                state.setOnboardingPath("rowboat");
                state.startConnect("rowboat");
              }}
              size="lg"
              className="w-full h-12 text-base font-medium"
              disabled={rowboatState.isConnecting}
            >
              {rowboatState.isConnecting ? (
                <>
                  <Loader2 className="size-5 animate-spin mr-2" />
                  Waiting for sign in...
                </>
              ) : (
                "Sign in with Rowboat"
              )}
            </Button>
            {rowboatState.isConnecting && (
              <p className="text-xs text-muted-foreground animate-pulse">
                Complete sign in in your browser, then return here.
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* BYOK link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <button
          onClick={() => {
            state.setOnboardingPath("byok");
            state.setCurrentStep(1);
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50"
        >
          I want to bring my own API key
        </button>
      </motion.div>

      {/* Vault selection for fresh vault */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-4"
      >
        <Button
          onClick={state.handleVaultSelect}
          disabled={state.vaultLoading}
          variant="outline"
          size="sm"
          className="text-sm"
        >
          {state.vaultLoading ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Selecting...
            </>
          ) : (
            <>
              <FolderOpen className="size-4 mr-2" />
              Open an existing folder as vault
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
