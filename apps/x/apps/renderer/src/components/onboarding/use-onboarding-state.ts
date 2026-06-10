import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface ProviderState {
  isConnected: boolean;
  isLoading: boolean;
  isConnecting: boolean;
}

export type Step = 0 | 1 | 2 | 3 | 4;

export type OnboardingPath = "byok" | null;

export type LlmProviderFlavor =
  | "openai"
  | "anthropic"
  | "google"
  | "opencode"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible";

export interface LlmModelOption {
  id: string;
  name?: string;
  release_date?: string;
}

export function useOnboardingState(open: boolean, onComplete: () => void, devMode = false) {
  const [currentStep, setCurrentStep] = useState<Step>(0);
  const [onboardingPath, setOnboardingPath] = useState<OnboardingPath>(null);

  // LLM setup state
  const [llmProvider, setLlmProvider] = useState<LlmProviderFlavor>("openai");
  const [modelsCatalog, setModelsCatalog] = useState<
    Record<string, LlmModelOption[]>
  >({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<
    Record<
      LlmProviderFlavor,
      {
        apiKey: string;
        baseURL: string;
        model: string;
        knowledgeGraphModel: string;
        meetingNotesModel: string;
        trackBlockModel: string;
      }
    >
  >({
    openai: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    anthropic: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    google: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    opencode: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    openrouter: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    aigateway: {
      apiKey: "",
      baseURL: "",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    ollama: {
      apiKey: "",
      baseURL: "http://localhost:11434",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    "openai-compatible": {
      apiKey: "",
      baseURL: "http://localhost:1234/v1",
      model: "",
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
  });
  const [testState, setTestState] = useState<{
    status: "idle" | "testing" | "success" | "error";
    error?: string;
  }>({
    status: "idle",
  });
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  // Vault path state
  const [vaultPath, setVaultPath] = useState<string | null>(null);

  const updateProviderConfig = useCallback(
    (
      provider: LlmProviderFlavor,
      updates: Partial<{
        apiKey: string;
        baseURL: string;
        model: string;
        knowledgeGraphModel: string;
        meetingNotesModel: string;
        trackBlockModel: string;
      }>,
    ) => {
      setProviderConfigs((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], ...updates },
      }));
      setTestState({ status: "idle" });
    },
    [],
  );

  const activeConfig = providerConfigs[llmProvider];
  const showApiKey =
    llmProvider === "openai" ||
    llmProvider === "anthropic" ||
    llmProvider === "google" ||
    llmProvider === "opencode" ||
    llmProvider === "openrouter" ||
    llmProvider === "aigateway" ||
    llmProvider === "openai-compatible";
  const requiresApiKey =
    llmProvider === "openai" ||
    llmProvider === "anthropic" ||
    llmProvider === "google" ||
    llmProvider === "openrouter" ||
    llmProvider === "aigateway";
  const requiresBaseURL =
    llmProvider === "ollama" || llmProvider === "openai-compatible";
  const showBaseURL =
    llmProvider === "ollama" ||
    llmProvider === "openai-compatible" ||
    llmProvider === "aigateway";
  const isLocalProvider =
    llmProvider === "ollama" || llmProvider === "openai-compatible";
  const canTest =
    activeConfig.model.trim().length > 0 &&
    (!requiresApiKey || activeConfig.apiKey.trim().length > 0) &&
    (!requiresBaseURL || activeConfig.baseURL.trim().length > 0);

  // Load vault path and LLM models catalog on open
  useEffect(() => {
    if (!open) return;

    async function loadVaultPath() {
      try {
        const result = await window.ipc.invoke("vault:getPath", null);
        setVaultPath(result.path || null);
      } catch (error) {
        console.error("Failed to load vault path:", error);
      }
    }

    async function loadModels() {
      try {
        setModelsLoading(true);
        setModelsError(null);
        const result = await window.ipc.invoke("models:list", null);
        const catalog: Record<string, LlmModelOption[]> = {};
        for (const provider of result.providers || []) {
          catalog[provider.id] = provider.models || [];
        }
        setModelsCatalog(catalog);
      } catch (error) {
        console.error("Failed to load models catalog:", error);
        setModelsError("Failed to load models list");
        setModelsCatalog({});
      } finally {
        setModelsLoading(false);
      }
    }

    loadVaultPath();
    loadModels();
  }, [open]);

  // Preferred default models for each provider
  const preferredDefaults: Partial<Record<LlmProviderFlavor, string>> = {
    openai: "gpt-5.2",
    anthropic: "claude-opus-4-6-20260202",
  };

  // Initialize default models from catalog
  useEffect(() => {
    if (Object.keys(modelsCatalog).length === 0) return;
    setProviderConfigs((prev) => {
      const next = { ...prev };
      const cloudProviders: LlmProviderFlavor[] = [
        "openai",
        "anthropic",
        "google",
      ];
      for (const provider of cloudProviders) {
        const models = modelsCatalog[provider];
        if (models?.length && !next[provider].model) {
          const preferredModel = preferredDefaults[provider];
          const hasPreferred =
            preferredModel && models.some((m) => m.id === preferredModel);
          next[provider] = {
            ...next[provider],
            model: hasPreferred ? preferredModel : models[0]?.id || "",
          };
        }
      }
      return next;
    });
  }, [modelsCatalog]);

  // Step flow (5 steps, 0-4):
  // 0: Welcome + Vault Selection
  // 1: AI Provider Setup (if BYOK)
  // 2: Appearance
  // 3: Feature Tour
  // 4: Completion
  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      if (onboardingPath === "byok") {
        setCurrentStep(1);
      } else {
        setCurrentStep(2);
      }
    } else if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  }, [currentStep, onboardingPath]);

  const handleBack = useCallback(() => {
    if (currentStep === 1) {
      setCurrentStep(0);
      setOnboardingPath(null);
    } else if (currentStep === 2) {
      if (onboardingPath === "byok") {
        setCurrentStep(1);
      } else {
        setCurrentStep(0);
      }
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else if (currentStep === 4) {
      setCurrentStep(3);
    }
  }, [currentStep, onboardingPath]);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleTestAndSaveLlmConfig = useCallback(async () => {
    if (!canTest) return;
    setTestState({ status: "testing" });
    try {
      const apiKey = activeConfig.apiKey.trim() || undefined;
      const baseURL = activeConfig.baseURL.trim() || undefined;
      const model = activeConfig.model.trim();
      const knowledgeGraphModel =
        activeConfig.knowledgeGraphModel.trim() || undefined;
      const meetingNotesModel =
        activeConfig.meetingNotesModel.trim() || undefined;
      const trackBlockModel = activeConfig.trackBlockModel.trim() || undefined;
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
      };
      const result = await window.ipc.invoke("models:test", providerConfig);
      if (result.success) {
        setTestState({ status: "success" });
        await window.ipc.invoke("models:saveConfig", providerConfig);
        window.dispatchEvent(new Event("models-config-changed"));
        handleNext();
      } else {
        setTestState({ status: "error", error: result.error });
        toast.error(result.error || "Connection test failed");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      setTestState({ status: "error", error: "Connection test failed" });
      toast.error("Connection test failed");
    }
  }, [
    activeConfig.apiKey,
    activeConfig.baseURL,
    activeConfig.model,
    activeConfig.knowledgeGraphModel,
    activeConfig.meetingNotesModel,
    activeConfig.trackBlockModel,
    canTest,
    llmProvider,
    handleNext,
  ]);

  // Connect accounts state
  const [providers] = useState<string[]>([]);
  const [providersLoading] = useState(false);
  const [providerStates] = useState<Record<string, ProviderState>>({});

  const handleConnect = useCallback((_provider: string) => {
    // no-op placeholder
  }, []);

  const [useComposioForGoogle] = useState(false);
  const [gmailConnected] = useState(false);
  const [gmailLoading] = useState(false);
  const [gmailConnecting] = useState(false);

  const handleConnectGmail = useCallback(() => {
    // no-op placeholder
  }, []);

  // Vault selection state
  const [vaultLoading, setVaultLoading] = useState(false);

  // Handle vault selection (open existing folder as vault)
  const handleVaultSelect = useCallback(async () => {
    try {
      setVaultLoading(true);
      const result = await window.ipc.invoke("vault:select", null);
      if (result.success && result.path) {
        setVaultPath(result.path);
        toast.success(`Vault set to: ${result.path.split(/[\\\\/]/).pop()}.`);
      }
    } catch (err) {
      console.error("Failed to select vault:", err);
      toast.error("Failed to select vault");
    } finally {
      setVaultLoading(false);
    }
  }, []);

  return {
    // Dev mode
    devMode,

    // Step state
    currentStep,
    setCurrentStep,
    onboardingPath,
    setOnboardingPath,

    // LLM state
    llmProvider,
    setLlmProvider,
    modelsCatalog,
    modelsLoading,
    modelsError,
    providerConfigs,
    activeConfig,
    testState,
    setTestState,
    showApiKey,
    requiresApiKey,
    requiresBaseURL,
    showBaseURL,
    isLocalProvider,
    canTest,
    showMoreProviders,
    setShowMoreProviders,
    updateProviderConfig,
    handleTestAndSaveLlmConfig,

    // Navigation
    handleNext,
    handleBack,
    handleComplete,

    // Connect accounts
    providers,
    providersLoading,
    providerStates,
    handleConnect,
    useComposioForGoogle,
    gmailConnected,
    gmailLoading,
    gmailConnecting,
    handleConnectGmail,

    // Vault
    vaultPath,
    vaultLoading,
    handleVaultSelect,
  };
}

export type OnboardingState = ReturnType<typeof useOnboardingState>;
