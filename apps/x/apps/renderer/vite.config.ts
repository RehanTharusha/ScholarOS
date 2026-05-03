import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  base: "./", // Use relative paths for assets (required for Electron custom protocol)
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true, // Fail if port is already in use instead of auto-incrementing
  },
  build: {
    outDir: "dist",
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-pdf-worker",
      writeBundle: async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const src = path.resolve(
          __dirname,
          "node_modules/react-pdf/dist/pdf.worker.min.mjs",
        );
        const dest = path.resolve(__dirname, "dist/pdf.worker.min.mjs");
        await fs.copyFile(src, dest);
      },
    },
  ],
});
