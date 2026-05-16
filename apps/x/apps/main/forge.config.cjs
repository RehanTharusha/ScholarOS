// Electron Forge config file
// NOTE: Must be .cjs (CommonJS) because package.json has "type": "module"
// Forge loads configs with require(), which fails on ESM files

const path = require("path");
    const pkg = require("./package.json");



module.exports = {
  packagerConfig: {
    executableName: "scholaros",
    icon: "./icons/icon", // .icns extension added automatically
    appBundleId: "com.scholaros.app",
    appCategoryType: "public.app-category.productivity",
    extendInfo: {
      NSAudioCaptureUsageDescription:
        "ScholarOS needs access to system audio to transcribe meetings from other apps (Zoom, Meet, etc.)",
    },
    osxSign: {
      batchCodesignCalls: true,
      optionsForFile: () => ({
        entitlements: path.join(__dirname, "entitlements.plist"),
        "entitlements-inherit": path.join(__dirname, "entitlements.plist"),
      }),
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    // Since we bundle everything with esbuild, we don't need node_modules at all.
    // These settings prevent Forge's dependency walker (flora-colossus) from trying
    // to analyze/copy node_modules, which fails with pnpm's symlinked workspaces.
    prune: false,
    ignore: [
      /src\//,
      /node_modules\//,
      /.gitignore/,
      /bundle\.mjs/,
      /tsconfig.json/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: (arch) => ({
        format: "ULFO",
        name: `ScholarOS-darwin-${arch}-${pkg.version}`, // Architecture-specific name to avoid conflicts
      }),
    },
    {
      name: "@electron-forge/maker-squirrel",
      config: (arch) => ({
        authors: "scholaros",
        description: "AI coworker with memory",
        name: `ScholarOS-win32-${arch}`,
        setupExe: `ScholarOS-win32-${arch}-${pkg.version}-setup.exe`,
      }),
    },
    {
      name: "@electron-forge/maker-deb",
      config: (arch) => ({
        options: {
          name: `ScholarOS-linux`,
          bin: "scholaros",
          description: "Your AI study assistant",
          maintainer: "scholaroslabs",
          homepage: "https://scholaros.app",
        },
      }),
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        options: {
          name: `ScholarOS-linux`,
          bin: "scholaros",
          description: "Your AI study assistant",
          homepage: "https://scholaros.app",
        },
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platform: ["darwin", "win32", "linux"],
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "scholaros",
          name: "scholaros-app",
        },
        prerelease: true,
      },
    },
  ],
  hooks: {
    // Hook signature: (forgeConfig, platform, arch)
    // Note: Console output only shows if DEBUG or CI env vars are set
    generateAssets: async (forgeConfig, platform, arch) => {
      const { execSync } = require("child_process");
      const fs = require("fs");

      const packageDir = path.join(__dirname, ".package");

      // Clean staging directory (ensures fresh build every time)
      console.log("Cleaning staging directory...");
      if (fs.existsSync(packageDir)) {
        fs.rmSync(packageDir, { recursive: true });
      }
      fs.mkdirSync(packageDir, { recursive: true });

      // Build order matters! Dependencies must be built before dependents:
      // shared → core → (renderer, preload, main)

      // Build shared (TypeScript compilation) - no dependencies
      console.log("Building shared...");
      execSync("pnpm run build", {
        cwd: path.join(__dirname, "../../packages/shared"),
        stdio: "inherit",
      });

      // Build core (TypeScript compilation) - depends on shared
      console.log("Building core...");
      execSync("pnpm run build", {
        cwd: path.join(__dirname, "../../packages/core"),
        stdio: "inherit",
      });

      // Build renderer (Vite build) - depends on shared
      console.log("Building renderer...");
      execSync("pnpm run build", {
        cwd: path.join(__dirname, "../renderer"),
        stdio: "inherit",
      });

      // Build preload (TypeScript compilation) - depends on shared
      console.log("Building preload...");
      execSync("pnpm run build", {
        cwd: path.join(__dirname, "../preload"),
        stdio: "inherit",
      });

      // Build main (TypeScript compilation) - depends on core, shared
      console.log("Building main (tsc)...");
      execSync("pnpm run build", {
        cwd: __dirname,
        stdio: "inherit",
      });

      // Bundle main process with esbuild (inlines all dependencies)
      console.log("Bundling main process...");
      execSync("node bundle.mjs", {
        cwd: __dirname,
        stdio: "inherit",
      });

      // Copy preload dist into staging directory
      console.log("Copying preload...");
      const preloadSrc = path.join(__dirname, "../preload/dist");
      const preloadDest = path.join(packageDir, "preload/dist");
      fs.mkdirSync(preloadDest, { recursive: true });
      fs.cpSync(preloadSrc, preloadDest, { recursive: true });

      // Copy renderer dist into staging directory
      console.log("Copying renderer...");
      const rendererSrc = path.join(__dirname, "../renderer/dist");
      const rendererDest = path.join(packageDir, "renderer/dist");
      fs.mkdirSync(rendererDest, { recursive: true });
      fs.cpSync(rendererSrc, rendererDest, { recursive: true });

      // Copy pdf worker assets into staging for local PDF parsing.
      // This is critical for the PDF parser to work in packaged builds.
      console.log("Copying pdf.worker.mjs...");
      
      const pdfWorkerCandidates = [
        // Primary: pdfjs-dist (now a direct dependency in core package)
        (() => {
          try {
            return path.join(
              path.dirname(require.resolve("pdfjs-dist/package.json")),
              "build/pdf.worker.mjs",
            );
          } catch (e) {
            return null;
          }
        })(),
        // Secondary: pdf-parse's bundled worker
        (() => {
          try {
            return path.join(
              path.dirname(require.resolve("pdf-parse/package.json")),
              "dist/worker/pdf.worker.mjs",
            );
          } catch (e) {
            return null;
          }
        })(),
        // Fallback: react-pdf worker
        path.join(
          __dirname,
          "../renderer/node_modules/react-pdf/dist/pdf.worker.min.mjs",
        ),
        // Fallback: already built by renderer
        path.join(__dirname, "../renderer/dist/pdf.worker.min.mjs"),
      ].filter(Boolean);
      
      const pdfWorkerSrc = pdfWorkerCandidates.find((candidate) => {
        const exists = fs.existsSync(candidate);
        if (exists) {
          console.log(`  Found worker at: ${candidate}`);
        }
        return exists;
      });
      
      if (pdfWorkerSrc) {
        // Copy to renderer/dist for development
        const pdfWorkerDest = path.join(rendererDest, "pdf.worker.min.mjs");
        fs.copyFileSync(pdfWorkerSrc, pdfWorkerDest);
        console.log(`  ✓ Copied to renderer/dist`);
        
        // Copy to .package root for main process to find
        const packageRootPdf = path.join(packageDir, "pdf.worker.mjs");
        fs.copyFileSync(pdfWorkerSrc, packageRootPdf);
        console.log(`  ✓ Copied to .package root`);
        
        // Copy to .package/dist for bundled main process
        const packageDistPdf = path.join(packageDir, "dist", "pdf.worker.mjs");
        fs.mkdirSync(path.dirname(packageDistPdf), { recursive: true });
        fs.copyFileSync(pdfWorkerSrc, packageDistPdf);
        console.log(`  ✓ Copied to .package/dist`);
      } else {
        console.error(
          "❌ WARNING: Could not find PDF worker file. PDF parsing will fail in packaged build!",
          "Searched locations:",
          pdfWorkerCandidates,
        );
      }

      console.log("Copying ingestion assets...");
      // Optional ingest files - only copy if they exist
      const preloadIngestSrc = path.join(__dirname, "preload-ingest.js");
      const ingestHtmlSrc = path.join(__dirname, "../renderer/ingest.html");
      if (fs.existsSync(preloadIngestSrc)) {
        fs.copyFileSync(
          preloadIngestSrc,
          path.join(packageDir, "preload-ingest.js"),
        );
      }
      if (fs.existsSync(ingestHtmlSrc)) {
        fs.copyFileSync(ingestHtmlSrc, path.join(rendererDest, "ingest.html"));
      }

      console.log("✅ All assets staged in .package/");
    },
  },
};
