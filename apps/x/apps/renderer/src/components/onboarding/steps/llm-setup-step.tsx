import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  OpenAIIcon,
  AnthropicIcon,
  GoogleIcon,
  OllamaIcon,
  OpenRouterIcon,
  VercelIcon,
  GenericApiIcon,
  OpenCodeIcon,
} from "../provider-icons"
import type { OnboardingState, LlmProviderFlavor } from "../use-onboarding-state"

interface LlmSetupStepProps {
  state: OnboardingState
}

const primaryProviders: Array<{ id: LlmProviderFlavor; name: string; description: string; color: string; icon: React.ReactNode }> = [
  { id: "openai", name: "OpenAI", description: "GPT models", color: "bg-green-500/10 text-green-600 dark:text-green-400", icon: <OpenAIIcon /> },
  { id: "anthropic", name: "Anthropic", description: "Claude models", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", icon: <AnthropicIcon /> },
  { id: "google", name: "Gemini", description: "Google AI Studio", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: <GoogleIcon /> },
  { id: "opencode", name: "OpenCode", description: "OpenCode models", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", icon: <OpenCodeIcon /> },
  { id: "ollama", name: "Ollama", description: "Local models", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", icon: <OllamaIcon /> },
]

const moreProviders: Array<{ id: LlmProviderFlavor; name: string; description: string; color: string; icon: React.ReactNode }> = [
  { id: "openrouter", name: "OpenRouter", description: "Multiple models, one key", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400", icon: <OpenRouterIcon /> },
  { id: "aigateway", name: "AI Gateway", description: "Vercel AI Gateway", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400", icon: <VercelIcon /> },
  { id: "openai-compatible", name: "OpenAI-Compatible", description: "Custom endpoint", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400", icon: <GenericApiIcon /> },
]

export function LlmSetupStep({ state }: LlmSetupStepProps) {
  const {
    llmProvider, setLlmProvider, modelsCatalog, modelsLoading, modelsError,
    activeConfig, testState, setTestState, showApiKey,
    showBaseURL, isLocalProvider, canTest, showMoreProviders, setShowMoreProviders,
    updateProviderConfig, handleTestAndSaveLlmConfig, handleBack,
  } = state

  const isMoreProvider = moreProviders.some(p => p.id === llmProvider)
  const modelsForProvider = modelsCatalog[llmProvider] || []
  const showModelInput = isLocalProvider || modelsForProvider.length === 0

  const renderProviderCard = (provider: typeof primaryProviders[0], index: number) => {
    const isSelected = llmProvider === provider.id
    return (
      <motion.button
        key={provider.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        onClick={() => {
          setLlmProvider(provider.id)
          setTestState({ status: "idle" })
        }}
        className={cn(
          "rounded-xl border-2 p-4 text-left transition-all",
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-transparent bg-muted/50 hover:bg-muted"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("size-10 rounded-lg flex items-center justify-center shrink-0", provider.color)}>
            {provider.icon}
          </div>
          <div>
            <div className="text-sm font-semibold">{provider.name}</div>
            <div className="text-xs text-muted-foreground">{provider.description}</div>
          </div>
        </div>
      </motion.button>
    )
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Title */}
      <h2 className="text-3xl font-bold tracking-tight text-center mb-2">
        Connect your AI
      </h2>
      <p className="text-base text-muted-foreground text-center mb-6">
        Choose a provider to power ScholarOS
      </p>

      {/* Provider selection */}
      <div className="space-y-3 mb-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {primaryProviders.map((p, i) => renderProviderCard(p, i))}
        </div>
        {(showMoreProviders || isMoreProvider) ? (
          <div className="grid gap-2 sm:grid-cols-3 mt-2">
            {moreProviders.map((p, i) => renderProviderCard(p, i + primaryProviders.length))}
          </div>
        ) : (
          <button
            onClick={() => setShowMoreProviders(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            More providers →
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="h-px bg-border my-4" />

      {/* Model configuration */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Model Configuration</h3>

        <div className="space-y-4">
          <div className="space-y-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">
              Model
            </label>
            {modelsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading...
              </div>
            ) : showModelInput ? (
              <Input
                value={activeConfig.model}
                onChange={(e) => updateProviderConfig(llmProvider, { model: e.target.value })}
                placeholder="Enter model"
              />
            ) : (
              <Select
                value={activeConfig.model}
                onValueChange={(value) => updateProviderConfig(llmProvider, { model: value })}
              >
                <SelectTrigger className="w-full truncate">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {modelsForProvider.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name || model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {modelsError && (
              <div className="text-xs text-destructive">{modelsError}</div>
            )}
          </div>

          {showApiKey && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                API Key {!state.requiresApiKey && "(optional)"}
              </label>
              <Input
                type="password"
                value={activeConfig.apiKey}
                onChange={(e) => updateProviderConfig(llmProvider, { apiKey: e.target.value })}
                placeholder="Paste your API key"
                className="font-mono"
              />
            </div>
          )}

          {showBaseURL && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Base URL
              </label>
              <Input
                value={activeConfig.baseURL}
                onChange={(e) => updateProviderConfig(llmProvider, { baseURL: e.target.value })}
                placeholder={
                  llmProvider === "ollama"
                    ? "http://localhost:11434"
                    : llmProvider === "openai-compatible"
                      ? "http://localhost:1234/v1"
                      : "https://ai-gateway.vercel.sh/v1"
                }
                className="font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t">
        <Button variant="ghost" onClick={handleBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          {state.devMode && (
            <Button
              variant="outline"
              onClick={state.handleNext}
              className="min-w-[100px]"
            >
              Skip
            </Button>
          )}
          {testState.status === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"
            >
              <CheckCircle2 className="size-4" />
              Connected
            </motion.div>
          )}
          {testState.status === "error" && (
            <span className="text-sm text-destructive max-w-[200px] truncate">
              {testState.error}
            </span>
          )}
          <Button
            onClick={handleTestAndSaveLlmConfig}
            disabled={!canTest || testState.status === "testing"}
            className="min-w-[140px]"
          >
            {testState.status === "testing" ? (
              <><Loader2 className="size-4 animate-spin mr-2" />Testing...</>
            ) : (
              "Test & Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
