import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface Course {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

const COURSE_COLORS = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#8B5CF6", // purple
  "#F97316", // orange
  "#EC4899", // pink
  "#14B8A6", // teal
];

export type Step = 0 | 1 | 2 | 3;

export type LlmProviderFlavor =
  | "openai"
  | "anthropic"
  | "google"
  | "opencode"
  | "opencode-zen"
  | "opencode-go"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible";

export interface LlmModelOption {
  id: string;
  name?: string;
  release_date?: string;
}

export function useOnboardingState(open: boolean, onComplete: () => void) {
  const [currentStep, setCurrentStep] = useState<Step>(0);

  // Course state
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseInput, setCourseInput] = useState("");

  const addCourse = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (courses.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        toast.error("Course already added");
        return;
      }
      const color = COURSE_COLORS[courses.length % COURSE_COLORS.length];
      const course: Course = {
        id: crypto.randomUUID(),
        name: trimmed,
        color,
        createdAt: new Date().toISOString(),
      };
      setCourses((prev) => [...prev, course]);
      setCourseInput("");
    },
    [courses],
  );

  const removeCourse = useCallback((id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const saveCourses = useCallback(async (): Promise<boolean> => {
    try {
      await window.ipc.invoke("workspace:mkdir", {
        path: ".scholar",
        recursive: true,
      });
      const items = courses.map((c, i) => ({
        id: c.id,
        type: "course" as const,
        name: c.name,
        path: `courses/${c.name}`,
        customName: null,
        color: c.color,
        createdAt: c.createdAt,
        order: i,
      }));
      await window.ipc.invoke("workspace:writeFile", {
        path: ".scholar/quick-access.json",
        data: JSON.stringify({ items }, null, 2),
      });
      return true;
    } catch (error) {
      console.error("Failed to save courses:", error);
      return false;
    }
  }, [courses]);

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
      { apiKey: string; baseURL: string; model: string }
    >
  >({
    openai: { apiKey: "", baseURL: "", model: "" },
    anthropic: { apiKey: "", baseURL: "", model: "" },
    google: { apiKey: "", baseURL: "", model: "" },
    opencode: { apiKey: "", baseURL: "", model: "" },
    "opencode-zen": { apiKey: "", baseURL: "https://opencode.ai/zen/v1", model: "" },
    "opencode-go": { apiKey: "", baseURL: "https://opencode.ai/zen/go/v1", model: "" },
    openrouter: { apiKey: "", baseURL: "", model: "" },
    aigateway: { apiKey: "", baseURL: "", model: "" },
    ollama: { apiKey: "", baseURL: "http://localhost:11434", model: "" },
    "openai-compatible": {
      apiKey: "",
      baseURL: "http://localhost:1234/v1",
      model: "",
    },
  });
  const [testState, setTestState] = useState<{
    status: "idle" | "testing" | "success" | "error";
    error?: string;
  }>({ status: "idle" });
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [skipLlm, setSkipLlm] = useState(false);
  const [hasScholarOSAccount, setHasScholarOSAccount] = useState(false);

  const updateProviderConfig = useCallback(
    (
      provider: LlmProviderFlavor,
      updates: Partial<{ apiKey: string; baseURL: string; model: string }>,
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
    llmProvider === "opencode-zen" ||
    llmProvider === "opencode-go" ||
    llmProvider === "openrouter" ||
    llmProvider === "aigateway" ||
    llmProvider === "openai-compatible";
  const requiresApiKey =
    llmProvider === "openai" ||
    llmProvider === "anthropic" ||
    llmProvider === "google" ||
    llmProvider === "openrouter" ||
    llmProvider === "aigateway";
  const showBaseURL =
    llmProvider === "ollama" ||
    llmProvider === "openai-compatible" ||
    llmProvider === "aigateway";
  const isLocalProvider =
    llmProvider === "ollama" || llmProvider === "openai-compatible";
  const canTest =
    activeConfig.model.trim().length > 0 &&
    (!requiresApiKey || activeConfig.apiKey.trim().length > 0);

  // Load models catalog on open
  useEffect(() => {
    if (!open) return;

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

    loadModels();
    // Check for existing ScholarOS account (OpenRouter key)
    checkExistingConfig();
  }, [open]);

  // Fetch OpenCode models when provider/apiKey changes
  const currentOpenCodeApiKey = providerConfigs[llmProvider]?.apiKey ?? "";
  useEffect(() => {
    if (!open) return;
    if (llmProvider !== "opencode-zen" && llmProvider !== "opencode-go") return;
    if (!currentOpenCodeApiKey.trim()) return;

    let cancelled = false;

    async function fetchModels() {
      try {
        setModelsLoading(true);
        const result = await window.ipc.invoke("models:list-opencode", {
          flavor: llmProvider,
          apiKey: currentOpenCodeApiKey.trim(),
        });
        if (cancelled) return;
        if (result?.providers?.length) {
          setModelsCatalog((prev) => {
            const next = { ...prev };
            for (const p of result.providers) {
              next[p.id] = p.models || [];
            }
            return next;
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch OpenCode models:", err);
          setModelsError("Failed to load OpenCode models");
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }

    fetchModels();
    return () => { cancelled = true; };
  }, [open, llmProvider, currentOpenCodeApiKey]);

  // Fetch OpenRouter models when OpenRouter is the selected provider
  useEffect(() => {
    if (!open) return;
    if (llmProvider !== "openrouter") return;

    let cancelled = false;

    async function fetchModels() {
      try {
        setModelsLoading(true);
        const result = await window.ipc.invoke("models:list-openrouter", null);
        if (cancelled) return;
        if (result?.models?.length) {
          setModelsCatalog((prev) => ({
            ...prev,
            openrouter: result.models,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch OpenRouter models:", err);
          setModelsError("Failed to load OpenRouter models");
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }

    fetchModels();
    return () => { cancelled = true; };
  }, [open, llmProvider]);

  const checkExistingConfig = useCallback(async () => {
    try {
      const result = await window.ipc.invoke("models:getConfig", null);
      if (
        result?.provider?.flavor === "openrouter" &&
        result?.provider?.apiKey
      ) {
        setHasScholarOSAccount(true);
        setLlmProvider("openrouter");
      }
    } catch {
      // No existing config
    }
  }, []);

  // Preferred default models
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

  // Navigation (linear 0→1→2→3)
  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 3) as Step);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0) as Step);
  }, []);

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
      const providerConfig = {
        provider: {
          flavor: llmProvider,
          apiKey,
          baseURL,
        },
        model,
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
    canTest,
    llmProvider,
    handleNext,
  ]);

  return {
    // Step state
    currentStep,
    setCurrentStep,

    // Course state
    courses,
    courseInput,
    setCourseInput,
    addCourse,
    removeCourse,
    saveCourses,

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
    showBaseURL,
    isLocalProvider,
    canTest,
    showMoreProviders,
    setShowMoreProviders,
    skipLlm,
    setSkipLlm,
    hasScholarOSAccount,
    updateProviderConfig,
    handleTestAndSaveLlmConfig,

    // Navigation
    handleNext,
    handleBack,
    handleComplete,
  };
}

export type OnboardingState = ReturnType<typeof useOnboardingState>;
