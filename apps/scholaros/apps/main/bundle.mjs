/**
 * Bundles the compiled main process into a single JavaScript file.
 *
 * Why we bundle:
 * - pnpm uses symlinks for workspace packages (@scholaros/core, @scholaros/shared)
 * - Electron Forge's dependency walker (flora-colossus) cannot follow these symlinks
 * - Bundling inlines all dependencies into a single file, eliminating node_modules
 *
 * This script is called by the generateAssets hook in forge.config.js before packaging.
 */

import * as esbuild from "esbuild";

// In CommonJS, import.meta.url doesn't exist. We need to polyfill it.
// The banner defines __import_meta_url at the top of the bundle,
// and we use define to replace all import.meta.url references with it.
const cjsBanner = `var __import_meta_url = require('url').pathToFileURL(__filename).href;`;

await esbuild.build({
  entryPoints: ["./dist/main.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "./.package/dist/main.cjs",
  external: ["electron"],
  // Use CommonJS format - many dependencies use require() which doesn't work
  // well with esbuild's ESM shim. CJS handles dynamic requires natively.
  format: "cjs",
  // Inject the polyfill variable at the top
  banner: { js: cjsBanner },
  // Replace import.meta.url directly with our polyfill variable
  define: {
    "import.meta.url": "__import_meta_url",
  },
  // Polyfill browser APIs that pdfjs-dist needs in Node.js environment
  inject: ["./pdf-polyfill.js"],
});

console.log("✅ Main process bundled to .package/dist/main.cjs");

// Copy pdf.worker.mjs alongside the bundle so pdf-parse / pdfjs-dist can
// find it at runtime. This is needed in both dev mode (npm run dev) and
// packaging (forge generateAssets hooks into bundle.mjs).
//
// pdfjs-dist is a dependency of @scholaros/core, not apps/main. We resolve it
// from the core package's node_modules.
try {
  const { createRequire } = await import("module");
  const { copyFileSync, mkdirSync } = await import("fs");
  const { join, dirname, resolve } = await import("path");

  // Resolve from @scholaros/core so pnpm's module resolution finds pdfjs-dist
  const corePkg = resolve("../../packages/core/package.json");
  const coreReq = createRequire(corePkg);
  const workerPath = coreReq.resolve("pdfjs-dist/build/pdf.worker.mjs");

  const destDir = join(".package", "dist");
  mkdirSync(dirname(destDir), { recursive: true });

  const dest = join(destDir, "pdf.worker.mjs");
  copyFileSync(workerPath, dest);
  console.log("✅ pdf.worker.mjs copied to .package/dist/");
} catch (e) {
  console.error("❌ Failed to copy pdf.worker.mjs:", e.message);
}

