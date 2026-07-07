"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { toast } from "sonner"

interface ProviderState {
  isConnected: boolean
  isLoading: boolean
  isConnecting: boolean
}

interface OnboardingModalProps {
  open: boolean
  onComplete: () => void
}

type Step = 0 | 1 | 2 | 3 | 4

type OnboardingPath = 'scholaros' | 'byok' | null

type LlmProviderFlavor = "openai" | "anthropic" | "google" | "opencode" | "opencode-zen" | "opencode-go" | "openrouter" | "aigateway" | "ollama" | "openai-compatible"

interface LlmModelOption {
  id: string
  name?: string
  release_date?: string
}

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>(0)
  const [onboardingPath, setOnboardingPath] = useState<OnboardingPath>(null)

  // LLM setup state
  const [llmProvider, setLlmProvider] = useState<LlmProviderFlavor>("openai")
  const [modelsCatalog, setModelsCatalog] = useState<Record<string, LlmModelOption[]>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [providerConfigs, setProviderConfigs] = useState<Record<LlmProviderFlavor, { apiKey: string; baseURL: string; model: string; knowledgeGraphModel: string; meetingNotesModel: string; trackBlockModel: string }>>({
    openai: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    anthropic: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    google: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    opencode: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    "opencode-zen": { apiKey: "", baseURL: "https://opencode.ai/zen/v1", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    "opencode-go": { apiKey: "", baseURL: "https://opencode.ai/zen/go/v1", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    openrouter: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    aigateway: { apiKey: "", baseURL: "", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    ollama: { apiKey: "", baseURL: "http://localhost:11434", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
    "openai-compatible": { apiKey: "", baseURL: "http://localhost:1234/v1", model: "", knowledgeGraphModel: "", meetingNotesModel: "", trackBlockModel: "" },
  })
  const [testState, setTestState] = useState<{ status: "idle" | "testing" | "success" | "error"; error?: string }>({
    status: "idle",
  })
  // OAuth provider states
  const [providers, setProviders] = useState<string[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>({})
  const [showMoreProviders, setShowMoreProviders] = useState(false)

  const updateProviderConfig = useCallback(
    (provider: LlmProviderFlavor, updates: Partial<{ apiKey: string; baseURL: string; model: string; knowledgeGraphModel: string; meetingNotesModel: string; trackBlockModel: string }>) => {
      setProviderConfigs(prev => ({
        ...prev,
        [provider]: { ...prev[provider], ...updates },
      }))
      setTestState({ status: "idle" })
    },
    []
  )

  const activeConfig = providerConfigs[llmProvider]
  const showApiKey = llmProvider === "openai" || llmProvider === "anthropic" || llmProvider === "google" || llmProvider === "opencode" || llmProvider === "opencode-zen" || llmProvider === "opencode-go" || llmProvider === "openrouter" || llmProvider === "aigateway" || llmProvider === "openai-compatible"
  const requiresApiKey = llmProvider === "openai" || llmProvider === "anthropic" || llmProvider === "google" || llmProvider === "openrouter" || llmProvider === "aigateway"
  const requiresBaseURL = llmProvider === "ollama" || llmProvider === "openai-compatible"
  const showBaseURL = llmProvider === "ollama" || llmProvider === "openai-compatible" || llmProvider === "aigateway"
  const isLocalProvider = llmProvider === "ollama" || llmProvider === "openai-compatible"
  const canTest =
    activeConfig.model.trim().length > 0 &&
    (!requiresApiKey || activeConfig.apiKey.trim().length > 0) &&
    (!requiresBaseURL || activeConfig.baseURL.trim().length > 0)

  // Track connected providers for the completion step
  const connectedProviders = Object.entries(providerStates)
    .filter(([, state]) => state.isConnected)
    .map(([provider]) => provider)

  // Load available providers
  useEffect(() => {
    if (!open) return

    async function loadProviders() {
      try {
        setProvidersLoading(true)
        const result = await window.ipc.invoke('oauth:list-providers', null)
        setProviders(result.providers || [])
      } catch (error) {
        console.error('Failed to get available providers:', error)
        setProviders([])
      } finally {
        setProvidersLoading(false)
      }
    }
    loadProviders()
  }, [open])

  // Load LLM models catalog on open
  useEffect(() => {
    if (!open) return

    async function loadModels() {
      try {
        setModelsLoading(true)
        setModelsError(null)
        const result = await window.ipc.invoke("models:list", null)
        const catalog: Record<string, LlmModelOption[]> = {}
        for (const provider of result.providers || []) {
          catalog[provider.id] = provider.models || []
        }
        setModelsCatalog(catalog)
      } catch (error) {
        console.error("Failed to load models catalog:", error)
        setModelsError("Failed to load models list")
        setModelsCatalog({})
      } finally {
        setModelsLoading(false)
      }
    }

    loadModels()
  }, [open])

  // Fetch OpenCode models when provider/apiKey changes
  const currentOpenCodeApiKey = providerConfigs[llmProvider]?.apiKey ?? ""
  useEffect(() => {
    if (!open) return
    if (llmProvider !== "opencode-zen" && llmProvider !== "opencode-go") return
    if (!currentOpenCodeApiKey.trim()) return

    let cancelled = false

    async function fetchModels() {
      try {
        setModelsLoading(true)
        const result = await window.ipc.invoke("models:list-opencode", {
          flavor: llmProvider,
          apiKey: currentOpenCodeApiKey.trim(),
        })
        if (cancelled) return
        if (result?.providers?.length) {
          setModelsCatalog((prev) => {
            const next = { ...prev }
            for (const p of result.providers) {
              next[p.id] = p.models || []
            }
            return next
          })
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch OpenCode models:", err)
          setModelsError("Failed to load OpenCode models")
        }
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    fetchModels()
    return () => { cancelled = true }
  }, [open, llmProvider, currentOpenCodeApiKey])

  // Preferred default models for each provider
  const preferredDefaults: Partial<Record<LlmProviderFlavor, string>> = {
  openai: "gpt-5.2",
  anthropic: "claude-opus-4-6-20260202",
}

  // Initialize default models from catalog
  useEffect(() => {
    if (Object.keys(modelsCatalog).length === 0) return
    setProviderConfigs(prev => {
      const next = { ...prev }
      const cloudProviders: LlmProviderFlavor[] = ["openai", "anthropic", "google"]
      for (const provider of cloudProviders) {
        const models = modelsCatalog[provider]
        if (models?.length && !next[provider].model) {
          // Check if preferred default exists in the catalog
          const preferredModel = preferredDefaults[provider]
          const hasPreferred = preferredModel && models.some(m => m.id === preferredModel)
          next[provider] = { ...next[provider], model: hasPreferred ? preferredModel : (models[0]?.id || "") }
        }
      }
      return next
    })
  }, [modelsCatalog])



  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as Step)
    }
  }

  const handleBack = () => {
    if (currentStep === 1) {
      // BYOK upsell → back to sign-in page
      setOnboardingPath(null)
      setCurrentStep(0 as Step)
    } else if (currentStep === 2) {
      // LLM setup → back to BYOK upsell
      setCurrentStep(1 as Step)
    } else if (currentStep === 3) {
      // Connect accounts → back depends on path
      if (onboardingPath === 'scholaros') {
        setCurrentStep(0 as Step)
      } else {
        setCurrentStep(2 as Step)
      }
    }
  }

  const handleComplete = () => {
    onComplete()
  }

  const handleTestAndSaveLlmConfig = useCallback(async () => {
    if (!canTest) return
    setTestState({ status: "testing" })
    try {
      const apiKey = activeConfig.apiKey.trim() || undefined
      const baseURL = activeConfig.baseURL.trim() || undefined
      const model = activeConfig.model.trim()
      const knowledgeGraphModel = activeConfig.knowledgeGraphModel.trim() || undefined
      const meetingNotesModel = activeConfig.meetingNotesModel.trim() || undefined
      const trackBlockModel = activeConfig.trackBlockModel.trim() || undefined
      const providerConfig = {
        provider: {
          flavor: llmProvider,
          apiKey,
          baseURL,
        },
        model,
        knowledgeGraphModel,
        meetingNotesModel,
        trackBlockModel,
      }
      const result = await window.ipc.invoke("models:test", providerConfig)
      if (result.success) {
        setTestState({ status: "success" })
        // Save and continue
        await window.ipc.invoke("models:saveConfig", providerConfig)
        handleNext()
      } else {
        setTestState({ status: "error", error: result.error })
        toast.error(result.error || "Connection test failed")
      }
    } catch (error) {
      console.error("Connection test failed:", error)
      setTestState({ status: "error", error: "Connection test failed" })
      toast.error("Connection test failed")
    }
  }, [activeConfig.apiKey, activeConfig.baseURL, activeConfig.model, canTest, llmProvider, handleNext])

  // Check connection status for all providers
  const refreshAllStatuses = useCallback(async () => {
    if (providers.length === 0) return

    const newStates: Record<string, ProviderState> = {}

    try {
      const result = await window.ipc.invoke('oauth:getState', null)
      const config = result.config || {}
      for (const provider of providers) {
        newStates[provider] = {
          isConnected: config[provider]?.connected ?? false,
          isLoading: false,
          isConnecting: false,
        }
      }
    } catch (error) {
      console.error('Failed to check connection status for providers:', error)
      for (const provider of providers) {
        newStates[provider] = {
          isConnected: false,
          isLoading: false,
          isConnecting: false,
        }
      }
    }

    setProviderStates(newStates)
  }, [providers])

  // Refresh statuses when modal opens or providers list changes
  useEffect(() => {
    if (open && providers.length > 0) {
      refreshAllStatuses()
    }
  }, [open, providers, refreshAllStatuses])

  // Listen for OAuth completion events (state updates only — toasts handled by ConnectorsPopover)
  useEffect(() => {
    const cleanup = window.ipc.on('oauth:didConnect', (event) => {
      const { provider, success } = event

      setProviderStates(prev => ({
        ...prev,
        [provider]: {
          isConnected: success,
          isLoading: false,
          isConnecting: false,
        }
      }))
    })

    return cleanup
  }, [])

  // Auto-advance from ScholarOS sign-in step when OAuth completes
  useEffect(() => {
    if (onboardingPath !== 'scholaros' || currentStep !== 0) return

    const cleanup = window.ipc.on('oauth:didConnect', (event) => {
      if (event.provider === 'scholaros' && event.success) {
        setCurrentStep(3 as Step)
      }
    })

    return cleanup
  }, [onboardingPath, currentStep])

  const startConnect = useCallback(async (provider: string, credentials?: { clientId: string; clientSecret: string }) => {
    setProviderStates(prev => ({
      ...prev,
      [provider]: { ...prev[provider], isConnecting: true }
    }))

    try {
      const result = await window.ipc.invoke('oauth:connect', { provider, clientId: credentials?.clientId, clientSecret: credentials?.clientSecret })

      if (!result.success) {
        toast.error(result.error || `Failed to connect to ${provider}`)
        setProviderStates(prev => ({
          ...prev,
          [provider]: { ...prev[provider], isConnecting: false }
        }))
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      toast.error(`Failed to connect to ${provider}`)
      setProviderStates(prev => ({
        ...prev,
        [provider]: { ...prev[provider], isConnecting: false }
      }))
    }
  }, [])

  // Step indicator - dynamic based on path
  const renderStepIndicator = () => {
    // ScholarOS path: Sign In (0), Connect (3), Done (4) = 3 dots
    // BYOK path: Sign In (0), Upsell (1), Model (2), Connect (3), Done (4) = 5 dots
    // Before path is chosen: show 3 dots (minimal)
    const scholarosSteps = [0, 3, 4]
    const byokSteps = [0, 1, 2, 3, 4]
    const steps = onboardingPath === 'byok' ? byokSteps : scholarosSteps
    const currentIndex = steps.indexOf(currentStep)

    return (
      <div className="flex gap-2 justify-center mb-6">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              currentIndex >= i ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
    )
  }

  // Helper to render an OAuth provider row
  // Step 0: Sign in to ScholarOS (with BYOK option)
  const renderSignInStep = () => {
    const scholarosState = providerStates['scholaros'] || { isConnected: false, isLoading: false, isConnecting: false }

    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-lg font-medium text-muted-foreground">Your AI coworker, with memory</span>
        </div>
        <DialogHeader className="space-y-3 mb-8">
          <DialogTitle className="text-2xl">Sign in to ScholarOS</DialogTitle>
          <DialogDescription className="text-base max-w-md mx-auto">
            Connect your ScholarOS account for instant access to all models through our gateway — no API keys needed.
          </DialogDescription>
        </DialogHeader>

        {scholarosState.isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">Connected to ScholarOS</span>
            </div>
            <Button onClick={() => setCurrentStep(3 as Step)} size="lg" className="w-full max-w-xs">
              Continue
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            <Button
              onClick={() => {
                setOnboardingPath('scholaros')
                startConnect('scholaros')
              }}
              size="lg"
              className="w-full"
              disabled={scholarosState.isConnecting}
            >
              {scholarosState.isConnecting ? (
                <><Loader2 className="size-4 animate-spin mr-2" />Waiting for sign in...</>
              ) : (
                "Sign in with ScholarOS"
              )}
            </Button>
            {scholarosState.isConnecting && (
              <p className="text-xs text-muted-foreground">
                Complete sign in in your browser, then return here.
              </p>
            )}
          </div>
        )}

        <div className="w-full flex justify-end mt-8">
          <button
            onClick={() => {
              setOnboardingPath('byok')
              setCurrentStep(1 as Step)
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Bring your own key
          </button>
        </div>
      </div>
    )
  }

  // Step 1: BYOK upsell — explain benefits of ScholarOS before continuing with BYOK
  const renderByokUpsellStep = () => (
    <div className="flex flex-col">
      <DialogHeader className="text-center mb-6">
        <DialogTitle className="text-2xl">Before you continue</DialogTitle>
        <DialogDescription className="text-base max-w-md mx-auto">
          With a ScholarOS account, you get:
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 mb-8">
        <div className="flex items-start gap-3 rounded-md border px-4 py-3">
          <CheckCircle2 className="size-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">Instant access to all models</div>
            <div className="text-xs text-muted-foreground">GPT, Claude, Gemini, and more — no separate API keys needed</div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border px-4 py-3">
          <CheckCircle2 className="size-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">Simplified billing</div>
            <div className="text-xs text-muted-foreground">One account for everything — no juggling multiple provider subscriptions</div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border px-4 py-3">
          <CheckCircle2 className="size-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">Automatic updates</div>
            <div className="text-xs text-muted-foreground">New models are available as soon as they launch, with no configuration changes</div>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center mb-6">
        By continuing, you'll set up your own API keys instead of using ScholarOS's managed gateway.
      </p>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={handleNext}>
          I understand
        </Button>
      </div>
    </div>
  )

  // Step 2 (BYOK path): LLM Setup
  const renderLlmSetupStep = () => {
    const primaryProviders: Array<{ id: LlmProviderFlavor; name: string; description: string }> = [
      { id: "openai", name: "OpenAI", description: "Use your OpenAI API key" },
      { id: "anthropic", name: "Anthropic", description: "Use your Anthropic API key" },
      { id: "google", name: "Gemini", description: "Use your Google AI Studio key" },
      { id: "ollama", name: "Ollama (Local)", description: "Run a local model via Ollama" },
      { id: "opencode-zen", name: "OpenCode Zen", description: "Curated premium models" },
      { id: "opencode-go", name: "OpenCode Go", description: "Open models subscription" },
    ]

    const moreProviders: Array<{ id: LlmProviderFlavor; name: string; description: string }> = [
      { id: "openrouter", name: "OpenRouter", description: "Access multiple models with one key" },
      { id: "aigateway", name: "AI Gateway (Vercel)", description: "Use Vercel's AI Gateway" },
      { id: "openai-compatible", name: "OpenAI-Compatible", description: "Local or hosted OpenAI-compatible API" },
    ]

    const isMoreProvider = moreProviders.some(p => p.id === llmProvider)

    const modelsForProvider = modelsCatalog[llmProvider] || []
    const showModelInput = isLocalProvider || modelsForProvider.length === 0

    const renderProviderCard = (provider: { id: LlmProviderFlavor; name: string; description: string }) => (
      <button
        key={provider.id}
        onClick={() => {
          setLlmProvider(provider.id)
          setTestState({ status: "idle" })
        }}
        className={cn(
          "rounded-md border px-3 py-3 text-left transition-colors",
          llmProvider === provider.id
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-accent"
        )}
      >
        <div className="text-sm font-medium">{provider.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{provider.description}</div>
      </button>
    )

    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-lg font-medium text-muted-foreground">Your AI coworker, with memory</span>
        </div>
        <DialogHeader className="text-center mb-3">
          <DialogTitle className="text-2xl">Choose your model</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {primaryProviders.map(renderProviderCard)}
            </div>
            {(showMoreProviders || isMoreProvider) ? (
              <div className="grid gap-2 sm:grid-cols-2 mt-2">
                {moreProviders.map(renderProviderCard)}
              </div>
            ) : (
              <button
                onClick={() => setShowMoreProviders(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                More providers...
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assistant model</span>
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
                  <SelectTrigger>
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

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Knowledge graph model</span>
              {modelsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : showModelInput ? (
                <Input
                  value={activeConfig.knowledgeGraphModel}
                  onChange={(e) => updateProviderConfig(llmProvider, { knowledgeGraphModel: e.target.value })}
                  placeholder={activeConfig.model || "Enter model"}
                />
              ) : (
                <Select
                  value={activeConfig.knowledgeGraphModel || "__same__"}
                  onValueChange={(value) => updateProviderConfig(llmProvider, { knowledgeGraphModel: value === "__same__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">Same as assistant</SelectItem>
                    {modelsForProvider.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meeting notes model</span>
              {modelsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : showModelInput ? (
                <Input
                  value={activeConfig.meetingNotesModel}
                  onChange={(e) => updateProviderConfig(llmProvider, { meetingNotesModel: e.target.value })}
                  placeholder={activeConfig.model || "Enter model"}
                />
              ) : (
                <Select
                  value={activeConfig.meetingNotesModel || "__same__"}
                  onValueChange={(value) => updateProviderConfig(llmProvider, { meetingNotesModel: value === "__same__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">Same as assistant</SelectItem>
                    {modelsForProvider.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Track block model</span>
              {modelsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : showModelInput ? (
                <Input
                  value={activeConfig.trackBlockModel}
                  onChange={(e) => updateProviderConfig(llmProvider, { trackBlockModel: e.target.value })}
                  placeholder={activeConfig.model || "Enter model"}
                />
              ) : (
                <Select
                  value={activeConfig.trackBlockModel || "__same__"}
                  onValueChange={(value) => updateProviderConfig(llmProvider, { trackBlockModel: value === "__same__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">Same as assistant</SelectItem>
                    {modelsForProvider.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {showApiKey && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {llmProvider === "openai-compatible" ? "API Key (optional)" : "API Key"}
              </span>
              <Input
                type="password"
                value={activeConfig.apiKey}
                onChange={(e) => updateProviderConfig(llmProvider, { apiKey: e.target.value })}
                placeholder="Paste your API key"
              />
            </div>
          )}

          {showBaseURL && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Base URL</span>
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
              />
            </div>
          )}
        </div>

        {testState.status === "error" && (
          <div className="mt-4 text-sm text-destructive">
            {testState.error || "Connection test failed"}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" onClick={handleBack} className="gap-1">
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button
            onClick={handleTestAndSaveLlmConfig}
            disabled={!canTest || testState.status === "testing"}
          >
            {testState.status === "testing" ? (
              <><Loader2 className="size-4 animate-spin mr-2" />Testing connection...</>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Step 3: Connect Accounts
  const renderAccountConnectionStep = () => (
    <div className="flex flex-col">
      <DialogHeader className="text-center mb-6">
        <DialogTitle className="text-2xl">Connect Your Accounts</DialogTitle>
        <DialogDescription className="text-base">
          Connect your accounts to start syncing your data locally. You can always add more later.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>

          </>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-8">
        <Button onClick={handleNext} size="lg">
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

  // Step 4: Completion
  const renderCompletionStep = () => {
    const hasConnections = connectedProviders.length > 0

    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-green-100 mb-6">
          <CheckCircle2 className="size-10 text-green-600" />
        </div>
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl">You're All Set!</DialogTitle>
          <DialogDescription className="text-base max-w-md mx-auto">
            {hasConnections ? (
              <>Give me 30 minutes to build your context graph.<br />I can still help with other things on your computer.</>
            ) : (
              <>You can connect your accounts anytime from the sidebar to start syncing data.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasConnections && (
          <div className="mt-6 w-full max-w-sm">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium mb-2">Connected accounts:</p>
              <div className="space-y-1" />
            </div>
          </div>
        )}

        <Button onClick={handleComplete} size="lg" className="mt-8 w-full max-w-xs">
          Start Using ScholarOS
        </Button>
      </div>
    )
  }

  return (
    <>
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[60vw] max-w-3xl max-h-[80vh] overflow-y-auto"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {renderStepIndicator()}
        {currentStep === 0 && renderSignInStep()}
        {currentStep === 1 && renderByokUpsellStep()}
        {currentStep === 2 && renderLlmSetupStep()}
        {currentStep === 3 && renderAccountConnectionStep()}
        {currentStep === 4 && renderCompletionStep()}
      </DialogContent>
    </Dialog>
    </>
  )
}
