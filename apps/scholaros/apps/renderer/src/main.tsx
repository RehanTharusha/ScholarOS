import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { PostHogProvider } from "posthog-js/react";
import { ThemeProvider } from "@/contexts/theme-context";
import { IngestWindow } from "@/components/ingest-window";
import { ErrorBoundary } from "@/components/error-boundary";

const isIngestWindow =
  new URLSearchParams(window.location.search).get("mode") === "ingest";

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

const options = {
  api_host: posthogHost,
  defaults: "2025-11-30",
} as const;

const inner = (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="paper">
      {isIngestWindow ? <IngestWindow /> : <App />}
    </ThemeProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {posthogKey ? (
      <PostHogProvider apiKey={posthogKey} options={options}>
        {inner}
      </PostHogProvider>
    ) : (
      inner
    )}
  </StrictMode>,
);
