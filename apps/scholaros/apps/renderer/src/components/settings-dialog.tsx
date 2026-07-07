"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Server,
  Key,
  Shield,
  Palette,
  Monitor,
  Sun,
  Moon,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  BookOpen,
  Search,
  User,
  Plug,
  Type,
  TextSelect,
  Check,
  ChevronsUpDown,
} from "lucide-react";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { toast } from "sonner";
import { AccountSettings } from "@/components/settings/account-settings";
import { ConnectedAccountsSettings } from "@/components/settings/connected-accounts-settings";

type ConfigTab =
  | "account"
  | "connected-accounts"
  | "models"
  | "mcp"
  | "security"
  | "appearance";

interface TabConfig {
  id: ConfigTab;
  label: string;
  icon: React.ElementType;
  path?: string;
  description: string;
}

const tabs: TabConfig[] = [
  {
    id: "account",
    label: "Account",
    icon: User,
    description: "Manage your ScholarOS account",
  },
  {
    id: "connected-accounts",
    label: "Connected Accounts",
    icon: Plug,
    description: "Manage connected services",
  },
  {
    id: "models",
    label: "Models",
    icon: Key,
    path: "config/models.json",
    description: "Configure LLM providers and API keys",
  },
  {
    id: "mcp",
    label: "MCP Servers",
    icon: Server,
    path: "config/mcp.json",
    description: "Configure MCP server connections",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    path: "config/security.json",
    description: "Configure allowed shell commands",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Customize the look and feel",
  },

];

interface SettingsDialogProps {
  children: React.ReactNode;
}

// --- Theme option for Appearance tab ---

function ThemeOption({
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
        "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
      )}
    >
      <Icon
        className={cn(
          "size-6",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-sm font-medium",
          isSelected ? "text-primary" : "text-foreground",
        )}
      >
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
        "flex-1 px-3 py-2 text-sm font-medium rounded-md border-2 transition-all",
        isSelected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function AppearanceSettings() {
  const { theme, setTheme, fontStyle, setFontStyle, fontSize, setFontSize } =
    useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Theme</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Select your preferred color scheme
        </p>
        <div className="grid grid-cols-4 gap-2">
          <ThemeOption
            label="Light"
            icon={Sun}
            isSelected={theme === "light"}
            onClick={() => setTheme("light")}
          />
          <ThemeOption
            label="Paper"
            icon={BookOpen}
            isSelected={theme === "paper"}
            onClick={() => setTheme("paper")}
          />
          <ThemeOption
            label="Dark"
            icon={Moon}
            isSelected={theme === "dark"}
            onClick={() => setTheme("dark")}
          />
          <ThemeOption
            label="System"
            icon={Monitor}
            isSelected={theme === "system"}
            onClick={() => setTheme("system")}
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Typography</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Choose font style and base size
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Type className="size-4 text-muted-foreground shrink-0" />
            <div className="flex flex-1 gap-1">
              <OptionButton
                label="Serif"
                isSelected={fontStyle === "serif"}
                onClick={() => setFontStyle("serif")}
              />
              <OptionButton
                label="Sans"
                isSelected={fontStyle === "sans"}
                onClick={() => setFontStyle("sans")}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TextSelect className="size-4 text-muted-foreground shrink-0" />
            <div className="flex flex-1 gap-1">
              <OptionButton
                label="Small"
                isSelected={fontSize === "small"}
                onClick={() => setFontSize("small")}
              />
              <OptionButton
                label="Medium"
                isSelected={fontSize === "medium"}
                onClick={() => setFontSize("medium")}
              />
              <OptionButton
                label="Large"
                isSelected={fontSize === "large"}
                onClick={() => setFontSize("large")}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dev Only: Replay Onboarding */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Developer</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Re-run the onboarding flow to test or update your setup
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await window.ipc.invoke("onboarding:reset", null);
              window.location.reload();
            } catch (err) {
              console.error("Failed to reset onboarding:", err);
            }
          }}
        >
          Replay Onboarding
        </Button>
      </div>
    </div>
  );
}

type LlmProviderFlavor =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible"
  | "opencode"
  | "opencode-zen"
  | "opencode-go";

interface LlmModelOption {
  id: string;
  name?: string;
  release_date?: string;
}

const primaryProviders: Array<{
  id: LlmProviderFlavor;
  name: string;
  description: string;
}> = [
  { id: "openrouter", name: "OpenRouter", description: "Access hundreds of models" },
  { id: "opencode-zen", name: "OpenCode Zen", description: "Curated premium models" },
  { id: "opencode-go", name: "OpenCode Go", description: "Open models subscription" },
  { id: "openai", name: "OpenAI", description: "GPT models" },
  { id: "anthropic", name: "Anthropic", description: "Claude models" },
  { id: "google", name: "Gemini", description: "Google AI Studio" },
  { id: "ollama", name: "Ollama (Local)", description: "Run models locally" },
];

const moreProviders: Array<{
  id: LlmProviderFlavor;
  name: string;
  description: string;
}> = [
  {
    id: "aigateway",
    name: "AI Gateway (Vercel)",
    description: "Vercel's AI Gateway",
  },
  {
    id: "openai-compatible",
    name: "OpenAI-Compatible",
    description: "Custom OpenAI-compatible API",
  },
];

const preferredDefaults: Partial<Record<LlmProviderFlavor, string>> = {
  openai: "gpt-5.2",
  anthropic: "claude-opus-4-6-20260202",
};

const defaultBaseURLs: Partial<Record<LlmProviderFlavor, string>> = {
  ollama: "http://localhost:11434",
  "openai-compatible": "http://localhost:1234/v1",
  "opencode-zen": "https://opencode.ai/zen/v1",
  "opencode-go": "https://opencode.ai/zen/go/v1",
};

function ModelCommandSelect({
  value,
  onValueChange,
  models,
  placeholder,
  sameAsAssistant,
}: {
  value: string;
  onValueChange: (value: string) => void;
  models: LlmModelOption[];
  placeholder?: string;
  sameAsAssistant?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)),
    );
  }, [models, search]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        onClick={() => {
          setOpen((v) => !v);
          if (open) setSearch("");
        }}
        className="w-full justify-between font-normal"
      >
        {value
          ? models.find((m) => m.id === value)?.name || value
          : placeholder || "Select a model"}
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover text-popover-foreground rounded-md border shadow-lg">
          <div className="flex items-center border-b px-3">
            <Search className="size-4 shrink-0 opacity-50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              autoFocus
              className="placeholder:text-muted-foreground flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1">
            {sameAsAssistant && (
              <div
                className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                onMouseDown={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                Same as assistant
              </div>
            )}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No model found.
              </div>
            )}
            {filtered.map((model) => (
              <div
                key={model.id}
                className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                onMouseDown={() => {
                  onValueChange(model.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    value === model.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{model.name || model.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelSettings({ dialogOpen }: { dialogOpen: boolean }) {
  const [provider, setProvider] = useState<LlmProviderFlavor>("openai");
  const [defaultProvider, setDefaultProvider] =
    useState<LlmProviderFlavor | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<
    Record<
      LlmProviderFlavor,
      {
        apiKey: string;
        baseURL: string;
        models: string[];
        knowledgeGraphModel: string;
        meetingNotesModel: string;
        trackBlockModel: string;
      }
    >
  >({
    openai: {
      apiKey: "",
      baseURL: "",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    anthropic: {
      apiKey: "",
      baseURL: "",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    google: {
      apiKey: "",
      baseURL: "",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    openrouter: {
      apiKey: "",
      baseURL: "",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    aigateway: {
      apiKey: "",
      baseURL: "",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    ollama: {
      apiKey: "",
      baseURL: "http://localhost:11434",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    "openai-compatible": {
      apiKey: "",
      baseURL: "http://localhost:1234/v1",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    "opencode-zen": {
      apiKey: "",
      baseURL: "https://opencode.ai/zen/v1",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
    "opencode-go": {
      apiKey: "",
      baseURL: "https://opencode.ai/zen/go/v1",
      models: [""],
      knowledgeGraphModel: "",
      meetingNotesModel: "",
      trackBlockModel: "",
    },
  });
  const [modelsCatalog, setModelsCatalog] = useState<
    Record<string, LlmModelOption[]>
  >({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [testState, setTestState] = useState<{
    status: "idle" | "testing" | "success" | "error";
    error?: string;
  }>({ status: "idle" });
  const [configLoading, setConfigLoading] = useState(true);
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  const activeConfig = providerConfigs[provider];
  const showApiKey =
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "google" ||
    provider === "openrouter" ||
    provider === "aigateway" ||
    provider === "openai-compatible" ||
    provider === "opencode" ||
    provider === "opencode-zen" ||
    provider === "opencode-go";
  const requiresApiKey =
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "google" ||
    provider === "openrouter" ||
    provider === "aigateway";
  const showBaseURL =
    provider === "ollama" ||
    provider === "openai-compatible" ||
    provider === "aigateway" ||
    provider === "opencode-zen" ||
    provider === "opencode-go";
  const requiresBaseURL =
    provider === "ollama" || provider === "openai-compatible";
  const isLocalProvider =
    provider === "ollama" || provider === "openai-compatible";
  const modelsForProvider = modelsCatalog[provider] || [];
  const showModelInput = isLocalProvider || modelsForProvider.length === 0;
  const isMoreProvider = moreProviders.some((p) => p.id === provider);

  const primaryModel = activeConfig.models[0] || "";
  const canTest =
    primaryModel.trim().length > 0 &&
    (!requiresApiKey || activeConfig.apiKey.trim().length > 0) &&
    (!requiresBaseURL || activeConfig.baseURL.trim().length > 0);

  const updateConfig = useCallback(
    (
      prov: LlmProviderFlavor,
      updates: Partial<{
        apiKey: string;
        baseURL: string;
        models: string[];
        knowledgeGraphModel: string;
        meetingNotesModel: string;
        trackBlockModel: string;
      }>,
    ) => {
      setProviderConfigs((prev) => ({
        ...prev,
        [prov]: { ...prev[prov], ...updates },
      }));
      setTestState({ status: "idle" });
    },
    [],
  );

  const updateModelAt = useCallback(
    (prov: LlmProviderFlavor, index: number, value: string) => {
      setProviderConfigs((prev) => {
        const models = [...prev[prov].models];
        models[index] = value;
        return { ...prev, [prov]: { ...prev[prov], models } };
      });
      setTestState({ status: "idle" });
    },
    [],
  );

  const addModel = useCallback((prov: LlmProviderFlavor) => {
    setProviderConfigs((prev) => ({
      ...prev,
      [prov]: { ...prev[prov], models: [...prev[prov].models, ""] },
    }));
  }, []);

  const removeModel = useCallback((prov: LlmProviderFlavor, index: number) => {
    setProviderConfigs((prev) => {
      const models = prev[prov].models.filter((_, i) => i !== index);
      return {
        ...prev,
        [prov]: { ...prev[prov], models: models.length > 0 ? models : [""] },
      };
    });
    setTestState({ status: "idle" });
  }, []);

  // Load current config from file
  useEffect(() => {
    if (!dialogOpen) return;

    async function loadCurrentConfig() {
      try {
        setConfigLoading(true);
        const result = await window.ipc.invoke("workspace:readFile", {
          path: "config/models.json",
        });
        const parsed = JSON.parse(result.data);
        if (parsed?.provider?.flavor && parsed?.model) {
          const flavor = parsed.provider.flavor as LlmProviderFlavor;
          setProvider(flavor);
          setDefaultProvider(flavor);
          setProviderConfigs((prev) => {
            const next = { ...prev };
            // Hydrate all saved providers from the providers map
            if (parsed.providers) {
              for (const [key, entry] of Object.entries(parsed.providers)) {
                if (key in next) {
                  const e = entry as any;
                  const savedModels: string[] =
                    Array.isArray(e.models) && e.models.length > 0
                      ? e.models
                      : e.model
                        ? [e.model]
                        : [""];
                  next[key as LlmProviderFlavor] = {
                    apiKey: e.apiKey || "",
                    baseURL:
                      e.baseURL ||
                      defaultBaseURLs[key as LlmProviderFlavor] ||
                      "",
                    models: savedModels,
                    knowledgeGraphModel: e.knowledgeGraphModel || "",
                    meetingNotesModel: e.meetingNotesModel || "",
                    trackBlockModel: e.trackBlockModel || "",
                  };
                }
              }
            }
            // Active provider takes precedence from top-level config,
            // but only if it exists in the providers map (wasn't deleted)
            if (parsed.providers?.[flavor]) {
              const existingModels = next[flavor].models;
              const activeModels =
                existingModels[0] === parsed.model
                  ? existingModels
                  : [
                      parsed.model,
                      ...existingModels.filter(
                        (m: string) => m && m !== parsed.model,
                      ),
                    ];
              next[flavor] = {
                apiKey: parsed.provider.apiKey || "",
                baseURL:
                  parsed.provider.baseURL || defaultBaseURLs[flavor] || "",
                models: activeModels.length > 0 ? activeModels : [""],
                knowledgeGraphModel: parsed.knowledgeGraphModel || "",
                meetingNotesModel: parsed.meetingNotesModel || "",
                trackBlockModel: parsed.trackBlockModel || "",
              };
            }
            return next;
          });
        }
      } catch {
        // No existing config or parse error - use defaults
      } finally {
        setConfigLoading(false);
      }
    }

    loadCurrentConfig();
  }, [dialogOpen]);

  // Load models catalog
  useEffect(() => {
    if (!dialogOpen) return;

    async function loadModels() {
      try {
        setModelsLoading(true);
        setModelsError(null);
        const result = await window.ipc.invoke("models:list", null);
        const catalog: Record<string, LlmModelOption[]> = {};
        for (const p of result.providers || []) {
          catalog[p.id] = p.models || [];
        }
        setModelsCatalog(catalog);
      } catch {
        setModelsError("Failed to load models list");
        setModelsCatalog({});
      } finally {
        setModelsLoading(false);
      }
    }

    loadModels();
  }, [dialogOpen]);

  // Fetch OpenCode models when provider/apiKey changes
  const currentOpenCodeApiKey = providerConfigs[provider]?.apiKey ?? "";
  useEffect(() => {
    if (!dialogOpen) return;
    if (provider !== "opencode-zen" && provider !== "opencode-go") return;
    if (!currentOpenCodeApiKey.trim()) return;

    let cancelled = false;

    async function fetchModels() {
      try {
        setModelsLoading(true);
        const result = await window.ipc.invoke("models:list-opencode", {
          flavor: provider,
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
  }, [dialogOpen, provider, currentOpenCodeApiKey]);

  // Fetch OpenRouter models when OpenRouter is the selected provider
  useEffect(() => {
    if (!dialogOpen) return;
    if (provider !== "openrouter") return;

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
  }, [dialogOpen, provider]);

  // Set default models from catalog when catalog loads
  useEffect(() => {
    if (Object.keys(modelsCatalog).length === 0) return;
    setProviderConfigs((prev) => {
      const next = { ...prev };
      const cloudProviders: LlmProviderFlavor[] = [
        "openai",
        "anthropic",
        "google",
      ];
      for (const prov of cloudProviders) {
        const catalog = modelsCatalog[prov];
        if (catalog?.length && !next[prov].models[0]) {
          const preferred = preferredDefaults[prov];
          const hasPreferred =
            preferred && catalog.some((m) => m.id === preferred);
          const defaultModel = hasPreferred ? preferred! : catalog[0]?.id || "";
          next[prov] = { ...next[prov], models: [defaultModel] };
        }
      }
      return next;
    });
  }, [modelsCatalog]);

  const handleTestAndSave = useCallback(async () => {
    if (!canTest) return;
    setTestState({ status: "testing" });
    try {
      const allModels = activeConfig.models
        .map((m) => m.trim())
        .filter(Boolean);
      const providerConfig = {
        provider: {
          flavor: provider,
          apiKey: activeConfig.apiKey.trim() || undefined,
          baseURL: activeConfig.baseURL.trim() || undefined,
        },
        model: allModels[0] || "",
        models: allModels,
        knowledgeGraphModel:
          activeConfig.knowledgeGraphModel.trim() || undefined,
        meetingNotesModel: activeConfig.meetingNotesModel.trim() || undefined,
        trackBlockModel: activeConfig.trackBlockModel.trim() || undefined,
      };
      const result = await window.ipc.invoke("models:test", providerConfig);
      if (result.success) {
        await window.ipc.invoke("models:saveConfig", providerConfig);
        setDefaultProvider(provider);
        setTestState({ status: "success" });
        window.dispatchEvent(new Event("models-config-changed"));
        toast.success("Model configuration saved");
      } else {
        setTestState({ status: "error", error: result.error });
        toast.error(result.error || "Connection test failed");
      }
    } catch {
      setTestState({ status: "error", error: "Connection test failed" });
      toast.error("Connection test failed");
    }
  }, [canTest, provider, activeConfig]);

  const handleSetDefault = useCallback(
    async (prov: LlmProviderFlavor) => {
      const config = providerConfigs[prov];
      const allModels = config.models.map((m) => m.trim()).filter(Boolean);
      if (!allModels[0]) return;
      try {
        await window.ipc.invoke("models:saveConfig", {
          provider: {
            flavor: prov,
            apiKey: config.apiKey.trim() || undefined,
            baseURL: config.baseURL.trim() || undefined,
          },
          model: allModels[0],
          models: allModels,
          knowledgeGraphModel: config.knowledgeGraphModel.trim() || undefined,
          meetingNotesModel: config.meetingNotesModel.trim() || undefined,
          trackBlockModel: config.trackBlockModel.trim() || undefined,
        });
        setDefaultProvider(prov);
        window.dispatchEvent(new Event("models-config-changed"));
        toast.success("Default provider updated");
      } catch {
        toast.error("Failed to set default provider");
      }
    },
    [providerConfigs],
  );

  const handleDeleteProvider = useCallback(
    async (prov: LlmProviderFlavor) => {
      try {
        const result = await window.ipc.invoke("workspace:readFile", {
          path: "config/models.json",
        });
        const parsed = JSON.parse(result.data);
        if (parsed?.providers?.[prov]) {
          delete parsed.providers[prov];
        }
        // If the deleted provider is the current top-level active one,
        // switch top-level config to the current default provider
        if (
          parsed?.provider?.flavor === prov &&
          defaultProvider &&
          defaultProvider !== prov
        ) {
          const defConfig = providerConfigs[defaultProvider];
          const defModels = defConfig.models
            .map((m) => m.trim())
            .filter(Boolean);
          parsed.provider = {
            flavor: defaultProvider,
            apiKey: defConfig.apiKey.trim() || undefined,
            baseURL: defConfig.baseURL.trim() || undefined,
          };
          parsed.model = defModels[0] || "";
          parsed.models = defModels;
          parsed.knowledgeGraphModel =
            defConfig.knowledgeGraphModel.trim() || undefined;
          parsed.meetingNotesModel =
            defConfig.meetingNotesModel.trim() || undefined;
          parsed.trackBlockModel =
            defConfig.trackBlockModel.trim() || undefined;
        }
        await window.ipc.invoke("workspace:writeFile", {
          path: "config/models.json",
          data: JSON.stringify(parsed, null, 2),
        });
        setProviderConfigs((prev) => ({
          ...prev,
          [prov]: {
            apiKey: "",
            baseURL: defaultBaseURLs[prov] || "",
            models: [""],
            knowledgeGraphModel: "",
            meetingNotesModel: "",
            trackBlockModel: "",
          },
        }));
        setTestState({ status: "idle" });
        window.dispatchEvent(new Event("models-config-changed"));
        toast.success("Provider configuration removed");
      } catch {
        toast.error("Failed to remove provider");
      }
    },
    [defaultProvider, providerConfigs],
  );

  const renderProviderCard = (p: {
    id: LlmProviderFlavor;
    name: string;
    description: string;
  }) => {
    const isDefault = defaultProvider === p.id;
    const isSelected = provider === p.id;
    const hasModel = providerConfigs[p.id].models[0]?.trim().length > 0;
    return (
      <button
        key={p.id}
        onClick={() => {
          setProvider(p.id);
          setTestState({ status: "idle" });
        }}
        className={cn(
          "rounded-md border px-3 py-2.5 text-left transition-colors relative",
          isSelected
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-accent",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{p.name}</span>
          {isDefault && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
              Default
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {p.description}
        </div>
        {!isDefault && hasModel && isSelected && (
          <div className="mt-1.5 flex items-center gap-3">
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSetDefault(p.id);
              }}
              className="inline-flex text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              Set as default
            </span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteProvider(p.id);
              }}
              className="inline-flex text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              Remove
            </span>
          </div>
        )}
      </button>
    );
  };

  if (configLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider selection */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Provider
        </span>
        <div className="grid gap-2 grid-cols-2">
          {primaryProviders.map(renderProviderCard)}
        </div>
        {showMoreProviders || isMoreProvider ? (
          <div className="grid gap-2 grid-cols-2 mt-2">
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

      {/* Model selection - side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Assistant models (left column) */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Assistant model
          </span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="space-y-2">
              {activeConfig.models.map((model, index) => (
                <div key={index} className="group/model relative">
                  {showModelInput ? (
                    <Input
                      value={model}
                      onChange={(e) =>
                        updateModelAt(provider, index, e.target.value)
                      }
                      placeholder="Enter model"
                    />
                  ) : (
                    <ModelCommandSelect
                      value={model}
                      onValueChange={(value) =>
                        updateModelAt(provider, index, value)
                      }
                      models={modelsForProvider}
                      placeholder="Select a model"
                    />
                  )}
                  {activeConfig.models.length > 1 && (
                    <button
                      onClick={() => removeModel(provider, index)}
                      className="absolute right-8 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/model:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addModel(provider)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="size-3.5" />
                Add assistant model
              </button>
            </div>
          )}
          {modelsError && (
            <div className="text-xs text-destructive">{modelsError}</div>
          )}
        </div>

        {/* Knowledge graph model (right column) */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Knowledge graph model
          </span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.knowledgeGraphModel}
              onChange={(e) =>
                updateConfig(provider, { knowledgeGraphModel: e.target.value })
              }
              placeholder={primaryModel || "Enter model"}
            />
          ) : (
            <ModelCommandSelect
              value={activeConfig.knowledgeGraphModel}
              onValueChange={(value) =>
                updateConfig(provider, { knowledgeGraphModel: value })
              }
              models={modelsForProvider}
              placeholder="Same as assistant"
              sameAsAssistant
            />
          )}
        </div>

        {/* Meeting notes model */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Meeting notes model
          </span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.meetingNotesModel}
              onChange={(e) =>
                updateConfig(provider, { meetingNotesModel: e.target.value })
              }
              placeholder={primaryModel || "Enter model"}
            />
          ) : (
            <ModelCommandSelect
              value={activeConfig.meetingNotesModel}
              onValueChange={(value) =>
                updateConfig(provider, { meetingNotesModel: value })
              }
              models={modelsForProvider}
              placeholder="Same as assistant"
              sameAsAssistant
            />
          )}
        </div>

        {/* Track block model */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Track block model
          </span>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          ) : showModelInput ? (
            <Input
              value={activeConfig.trackBlockModel}
              onChange={(e) =>
                updateConfig(provider, { trackBlockModel: e.target.value })
              }
              placeholder={primaryModel || "Enter model"}
            />
          ) : (
            <ModelCommandSelect
              value={activeConfig.trackBlockModel}
              onValueChange={(value) =>
                updateConfig(provider, { trackBlockModel: value })
              }
              models={modelsForProvider}
              placeholder="Same as assistant"
              sameAsAssistant
            />
          )}
        </div>
      </div>

      {/* API Key */}
      {showApiKey && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {provider === "openai-compatible"
              ? "API Key (optional)"
              : "API Key"}
          </span>
          <Input
            type="password"
            value={activeConfig.apiKey}
            onChange={(e) => updateConfig(provider, { apiKey: e.target.value })}
            placeholder="Paste your API key"
          />
        </div>
      )}

      {/* Base URL */}
      {showBaseURL && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Base URL
          </span>
          <Input
            value={activeConfig.baseURL}
            onChange={(e) =>
              updateConfig(provider, { baseURL: e.target.value })
            }
            placeholder={
              provider === "ollama"
                ? "http://localhost:11434"
                : provider === "openai-compatible"
                  ? "http://localhost:1234/v1"
                  : "https://ai-gateway.vercel.sh/v1"
            }
          />
        </div>
      )}

      {/* Test status */}
      {testState.status === "error" && (
        <div className="text-sm text-destructive">
          {testState.error || "Connection test failed"}
        </div>
      )}
      {testState.status === "success" && (
        <div className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle2 className="size-4" />
          Connected and saved
        </div>
      )}

      {/* Test & Save button */}
      <Button
        onClick={handleTestAndSave}
        disabled={!canTest || testState.status === "testing"}
        className="w-full"
      >
        {testState.status === "testing" ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Testing connection...
          </>
        ) : (
          "Test & Save"
        )}
      </Button>
    </div>
  );
}

// --- ScholarOS Model Settings (when signed in via ScholarOS) ---

function ScholarOSModelSettings({ dialogOpen }: { dialogOpen: boolean }) {
  const [gatewayModels, setGatewayModels] = useState<LlmModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedKgModel, setSelectedKgModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;

    async function load() {
      setLoading(true);
      try {
        // Fetch gateway models
        const listResult = await window.ipc.invoke("models:list", null);
        const scholarosProvider = listResult.providers?.find(
          (p: { id: string }) => p.id === "scholaros",
        );
        const models = scholarosProvider?.models || [];
        setGatewayModels(models);

        // Read current selection from config
        try {
          const configResult = await window.ipc.invoke("workspace:readFile", {
            path: "config/models.json",
          });
          const parsed = JSON.parse(configResult.data);
          if (parsed?.model) setSelectedModel(parsed.model);
          if (parsed?.knowledgeGraphModel)
            setSelectedKgModel(parsed.knowledgeGraphModel);
        } catch {
          // No config yet — pick first model as default
          if (models.length > 0) setSelectedModel(models[0].id);
        }
      } catch {
        toast.error("Failed to load models");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [dialogOpen]);

  const handleSave = useCallback(async () => {
    if (!selectedModel) return;
    setSaving(true);
    try {
      await window.ipc.invoke("models:saveConfig", {
        provider: { flavor: "openrouter" as const },
        model: selectedModel,
        knowledgeGraphModel: selectedKgModel || undefined,
      });
      window.dispatchEvent(new Event("models-config-changed"));
      toast.success("Model configuration saved");
    } catch {
      toast.error("Failed to save model configuration");
    } finally {
      setSaving(false);
    }
  }, [selectedModel, selectedKgModel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Select the models ScholarOS uses. These are provided through your ScholarOS
        account.
      </p>

      {/* Assistant model */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Assistant model</label>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {gatewayModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Knowledge graph model */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Knowledge graph model</label>
        <Select
          value={selectedKgModel || "__same__"}
          onValueChange={(v) => setSelectedKgModel(v === "__same__" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Same as assistant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__same__">Same as assistant</SelectItem>
            {gatewayModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={!selectedModel || saving}>
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );
}

// --- Main Settings Dialog ---

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigTab>("account");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scholarosConnected, setScholarOSConnected] = useState(false);

  // Check if user is signed in to ScholarOS
  useEffect(() => {
    if (!open) return;
    window.ipc
      .invoke("oauth:getState", null)
      .then((result) => {
        const connected = result.config?.scholaros?.connected ?? false;
        setScholarOSConnected(connected);
      })
      .catch(() => {
        setScholarOSConnected(false);
      });
  }, [open]);

  const visibleTabs = useMemo(
    () => (scholarosConnected ? tabs.filter((t) => t.id !== "models") : tabs),
    [scholarosConnected],
  );

  const activeTabConfig =
    visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];
  const isJsonTab = activeTab === "mcp" || activeTab === "security";

  const formatJson = (jsonString: string): string => {
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2);
    } catch {
      return jsonString;
    }
  };

  const loadConfig = useCallback(async (tab: ConfigTab) => {
    if (
      tab === "appearance" ||
      tab === "models" ||
      tab === "account" ||
      tab === "connected-accounts"
    )
      return;
    const tabConfig = tabs.find((t) => t.id === tab)!;
    if (!tabConfig.path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.ipc.invoke("workspace:readFile", {
        path: tabConfig.path,
      });
      const formattedContent = formatJson(result.data);
      setContent(formattedContent);
      setOriginalContent(formattedContent);
    } catch {
      setError(`Failed to load ${tabConfig.label} config`);
      setContent("");
      setOriginalContent("");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = async () => {
    if (!isJsonTab || !activeTabConfig.path) return;
    setSaving(true);
    setError(null);
    try {
      JSON.parse(content);
      await window.ipc.invoke("workspace:writeFile", {
        path: activeTabConfig.path,
        data: content,
      });
      setOriginalContent(content);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Invalid JSON syntax");
      } else {
        setError(`Failed to save ${activeTabConfig.label} config`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = () => {
    setContent(formatJson(content));
  };

  const hasChanges = content !== originalContent;

  useEffect(() => {
    if (open && isJsonTab) {
      loadConfig(activeTab);
    }
  }, [open, activeTab, isJsonTab, loadConfig]);

  const handleTabChange = (tab: ConfigTab) => {
    if (isJsonTab && hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    setActiveTab(tab);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[900px]! w-[900px] h-[600px] p-0 gap-0 overflow-hidden">
        <div className="flex h-full overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r bg-muted/30 p-2 flex flex-col">
            <div className="px-2 py-3 mb-2">
              <h2 className="font-semibold text-sm">Settings</h2>
            </div>
            <nav className="flex flex-col gap-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors text-left",
                    activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                  )}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b">
              <h3 className="font-medium text-sm">{activeTabConfig.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeTab === "models" && scholarosConnected
                  ? "Select your default models"
                  : activeTabConfig.description}
              </p>
            </div>

            {/* Content */}
            <div
              className={cn(
                "flex-1 p-4 min-h-0",
                activeTab === "models" ||
                  activeTab === "account" ||
                  activeTab === "connected-accounts"
                  ? "overflow-y-auto"
                  : "overflow-hidden",
              )}
            >
              {activeTab === "account" ? (
                <AccountSettings dialogOpen={open} />
              ) : activeTab === "connected-accounts" ? (
                <ConnectedAccountsSettings dialogOpen={open} />
              ) : activeTab === "models" ? (
                scholarosConnected ? (
                  <ScholarOSModelSettings dialogOpen={open} />
                ) : (
                  <ModelSettings dialogOpen={open} />
                )
              ) : activeTab === "appearance" ? (
                <AppearanceSettings />
              ) : loading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full resize-none bg-muted/50 rounded-md p-3 font-mono text-sm border-0 focus:outline-none focus:ring-1 focus:ring-ring"
                  spellCheck={false}
                  placeholder="Loading configuration..."
                />
              )}
            </div>

            {/* Footer - only show for JSON config tabs */}
            {isJsonTab && (
              <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {error && (
                    <span className="text-xs text-destructive">{error}</span>
                  )}
                  {hasChanges && !error && (
                    <span className="text-xs text-muted-foreground">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFormat}
                    disabled={loading || saving}
                  >
                    Format
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveConfig}
                    disabled={loading || saving || !hasChanges}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
