/**
 * Robust PDF.js worker resolution for both development and packaged builds.
 *
 * Why this is needed:
 * - pdf-parse/pdfjs-dist uses web workers in Node.js as a "fake worker"
 * - The worker needs a path to pdf.worker.mjs at runtime
 * - Path resolution fails in packaged Electron builds due to bundle structure
 *
 * Solution:
 * - Try multiple resolution strategies (file-based, pdfjs-dist built-in, node_modules)
 * - Provide clear logging for debugging
 * - Support both development and packaged contexts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkerResolutionAttempt {
  strategy: string;
  location: string;
  found: boolean;
}

class PdfWorkerResolver {
  private attempts: WorkerResolutionAttempt[] = [];
  private resolvedPath: string | undefined;
  private DEBUG = process.env.PDF_WORKER_DEBUG === "1";

  /**
   * Resolve the PDF worker path for use with pdf-parse/pdfjs-dist.
   * Returns a file:// URL string that can be passed to PDFParse.setWorker()
   */
  resolve(): string | undefined {
    if (this.resolvedPath) {
      return this.resolvedPath;
    }

    // Try resolution strategies in order of reliability
    this.tryRequireResolveWorker();
    this.tryPdfjsDistBuiltIn();
    this.tryDirectNodeModulesPath();
    this.tryPackagedAppLocations();
    this.tryWorkingDirectoryLocations();
    this.tryRelativeToBuiltinToolsDir();

    // Log all attempts if debugging
    if (this.DEBUG) {
      console.log("[PDF Worker] Resolution attempts:");
      this.attempts.forEach((attempt) => {
        console.log(
          `  ${attempt.strategy}: ${attempt.location} ${attempt.found ? "✓" : "✗"}`,
        );
      });
    }

    if (this.resolvedPath) {
      if (this.DEBUG) {
        console.log(`[PDF Worker] Resolved to: ${this.resolvedPath}`);
      }
      return this.resolvedPath;
    }

    console.warn(
      "[PDF Worker] Failed to resolve worker path. PDF parsing will fail.",
      "Attempted locations:",
      this.attempts.map((a) => a.location),
    );
    return undefined;
  }

  /**
   * Strategy 1: Use Node's require.resolve to find the worker.
   * This works reliably in both dev and production because it uses actual
   * module resolution rather than relative file paths.
   */
  private tryRequireResolveWorker(): void {
    try {
      const candidate = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
      if (fs.existsSync(candidate)) {
        this.recordAttempt("require.resolve pdfjs-dist/build/pdf.worker.mjs", candidate, true);
        this.resolvedPath = pathToFileURL(candidate).href;
        return;
      }
      this.recordAttempt("require.resolve pdfjs-dist/build/pdf.worker.mjs", candidate, false);
    } catch {
      this.recordAttempt(
        "require.resolve pdfjs-dist/build/pdf.worker.mjs",
        "require.resolve failed",
        false,
      );
    }
  }

  /**
   * Strategy 2: Direct path to pdfjs-dist/build/pdf.worker.mjs in node_modules
   * Uses relative paths from the bundle location.
   */
  private tryDirectNodeModulesPath(): void {
    try {
      // Try to find pdfjs-dist in the package tree
      const candidates = [
        path.resolve(__dirname, "../../node_modules/pdfjs-dist/build/pdf.worker.mjs"),
        path.resolve(__dirname, "../../../node_modules/pdfjs-dist/build/pdf.worker.mjs"),
        path.resolve(__dirname, "../../../../node_modules/pdfjs-dist/build/pdf.worker.mjs"),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          this.recordAttempt("Direct node_modules/pdfjs-dist", candidate, true);
          this.resolvedPath = pathToFileURL(candidate).href;
          return;
        }
        this.recordAttempt("Direct node_modules/pdfjs-dist", candidate, false);
      }
    } catch {
      this.recordAttempt(
        "Direct node_modules/pdfjs-dist",
        "Error during lookup",
        false,
      );
    }
  }

  /**
   * Strategy 3: Use pdfjs-dist's built-in worker path
   * pdfjs-dist exports a default worker path that can be used directly.
   */
  private tryPdfjsDistBuiltIn(): void {
    try {
      // Import the package to get its resolved location
      const pdfjsDistPkg = require.resolve("pdfjs-dist/package.json");
      const pdfjsDistDir = path.dirname(pdfjsDistPkg);
      const workerPath = path.join(pdfjsDistDir, "build", "pdf.worker.mjs");

      this.recordAttempt("pdfjs-dist built-in", workerPath, fs.existsSync(workerPath));

      if (fs.existsSync(workerPath)) {
        this.resolvedPath = pathToFileURL(workerPath).href;
        return;
      }
    } catch {
      this.recordAttempt("pdfjs-dist built-in", "require.resolve failed", false);
    }
  }

  /**
   * Strategy 6: Relative to builtin-tools.ts directory
   * Works in development when files are in expected locations.
   */
  private tryRelativeToBuiltinToolsDir(): void {
    const candidates = [
      path.join(__dirname, "pdf.worker.mjs"),
      path.join(__dirname, "pdf.worker.min.mjs"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.recordAttempt("Relative to builtin-tools dir", candidate, true);
        this.resolvedPath = pathToFileURL(candidate).href;
        return;
      }
      this.recordAttempt("Relative to builtin-tools dir", candidate, false);
    }
  }

  /**
   * Strategy 4: Packaged Electron app locations
   * When bundled with esbuild, the app structure is .package/dist/main.cjs
   * The worker should be copied to .package/dist/ by bundle.mjs and forge.config.cjs
   */
  private tryPackagedAppLocations(): void {
    // In a packaged app, __dirname will be something like:
    // /path/to/app/resources/app/.package/dist/
    const baseDir = __dirname;

    const candidates = [
      path.join(baseDir, "pdf.worker.mjs"),
      path.join(baseDir, "pdf.worker.min.mjs"),
      // Also check one level up (.package/)
      path.join(baseDir, "..", "pdf.worker.mjs"),
      path.join(baseDir, "..", "pdf.worker.min.mjs"),
      // And renderer/dist/ subdirectory
      path.join(baseDir, "..", "renderer", "dist", "pdf.worker.min.mjs"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.recordAttempt("Packaged app location", candidate, true);
        this.resolvedPath = pathToFileURL(candidate).href;
        return;
      }
      this.recordAttempt("Packaged app location", candidate, false);
    }
  }

  /**
   * Strategy 5: Working directory locations
   * process.cwd() in different contexts (dev, test, packaged)
   */
  private tryWorkingDirectoryLocations(): void {
    const candidates = [
      path.join(process.cwd(), "pdf.worker.mjs"),
      path.join(process.cwd(), "dist", "pdf.worker.mjs"),
      path.join(process.cwd(), "pdf.worker.min.mjs"),
      path.join(process.cwd(), "dist", "pdf.worker.min.mjs"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.recordAttempt("Working directory", candidate, true);
        this.resolvedPath = pathToFileURL(candidate).href;
        return;
      }
      this.recordAttempt("Working directory", candidate, false);
    }
  }

  private recordAttempt(
    strategy: string,
    location: string,
    found: boolean,
  ): void {
    this.attempts.push({ strategy, location, found });
  }
}

// Singleton instance
let resolverInstance: PdfWorkerResolver | undefined;

/**
 * Get the resolved PDF worker path for use with pdf-parse/pdfjs-dist.
 * The result is cached on first call.
 *
 * Usage:
 *   import { getPdfWorkerPath } from './pdf-worker-resolver.js';
 *   const workerPath = getPdfWorkerPath();
 *   if (workerPath) {
 *     PDFParse.setWorker(workerPath);
 *   }
 */
export function getPdfWorkerPath(): string | undefined {
  if (!resolverInstance) {
    resolverInstance = new PdfWorkerResolver();
  }
  return resolverInstance.resolve();
}

/**
 * Reset the resolver (mainly for testing)
 */
export function resetPdfWorkerResolver(): void {
  resolverInstance = undefined;
}
