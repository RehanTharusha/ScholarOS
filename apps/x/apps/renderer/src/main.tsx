import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { PostHogProvider } from "posthog-js/react";
import { ThemeProvider } from "@/contexts/theme-context";
import { IngestWindow } from "@/components/ingest-window";

const isIngestWindow =
  new URLSearchParams(window.location.search).get("mode") === "ingest";

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2025-11-30",
} as const;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={options}
    >
      <ThemeProvider defaultTheme="system">
        {isIngestWindow ? <IngestWindow /> : <App />}
      </ThemeProvider>
    </PostHogProvider>
  </StrictMode>,
);
