import { exec, execSync, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { getSecurityAllowList } from "../../config/security.js";
import { getExecutionShell } from "../assistant/runtime-context.js";

const execPromise = promisify(exec);

const COMMAND_SPLIT_REGEX = /(?:\|\||&&|;|\||\n|`|\$\(|\(|\))/;
const ENV_ASSIGNMENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*=.*/;
const WRAPPER_COMMANDS = new Set(["sudo", "env", "time", "command"]);
const EXECUTION_SHELL = getExecutionShell();

// Commands that modify or delete files/directories - require user permission
const DESTRUCTIVE_COMMANDS = new Set([
  // File deletion
  "rm",
  "del",
  "unlink",
  "trash",
  // Directory deletion
  "rmdir",
  "rd",
  // File/disk destruction
  "shred",
  "wipe",
  "srm",
  "secure-delete",
  // Disk formatting
  "mkfs",
  "format",
  "fdisk",
  "parted",
  // Overwrite with dd
  "dd",
  // Process killing (can be destructive)
  "kill",
  "killall",
  "pkill",
  // Package removal
  "apt-get remove",
  "apt-get purge",
  "yum remove",
  "dnf remove",
  "pacman -r",
  "brew uninstall",
  // Git destructive operations
  "git reset --hard",
  "git clean",
  "git push --force",
  "git push -f",
  "git branch -d",
  "git branch -D",
  // Docker destructive
  "docker rm",
  "docker rmi",
  "docker system prune",
]);

/**
 * Check if a command is destructive (requires user permission)
 */
export function isDestructive(command: string): boolean {
  const invoked = extractCommandNames(command);

  // Check primary command names
  for (const cmd of invoked) {
    if (DESTRUCTIVE_COMMANDS.has(cmd)) {
      return true;
    }
  }

  // Check for destructive patterns in the full command
  const lowerCommand = command.toLowerCase();

  // Check for rm -rf or similar destructive flags
  if (
    lowerCommand.includes("rm ") &&
    (lowerCommand.includes("-rf") ||
      lowerCommand.includes("-fr") ||
      lowerCommand.includes("--force"))
  ) {
    return true;
  }

  // Check for git destructive patterns
  if (
    lowerCommand.includes("git") &&
    (lowerCommand.includes(" reset --hard") ||
      lowerCommand.includes(" clean -") ||
      lowerCommand.includes(" push --force") ||
      lowerCommand.includes(" push -f") ||
      lowerCommand.includes(" branch -d") ||
      lowerCommand.includes(" branch -D"))
  ) {
    return true;
  }

  // Check for docker rm/rmi with -f flag
  if (
    lowerCommand.includes("docker") &&
    ((lowerCommand.includes(" rm ") && lowerCommand.includes(" -f")) ||
      (lowerCommand.includes(" rmi ") && lowerCommand.includes(" -f")))
  ) {
    return true;
  }

  return false;
}

function sanitizeToken(token: string): string {
  return token.trim().replace(/^['"()]+|['"()]+$/g, "");
}

export function extractCommandNames(command: string): string[] {
  const discovered = new Set<string>();
  const segments = command.split(COMMAND_SPLIT_REGEX);

  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    let index = 0;
    while (index < tokens.length && ENV_ASSIGNMENT_REGEX.test(tokens[index])) {
      index++;
    }

    if (index >= tokens.length) continue;

    const primary = sanitizeToken(tokens[index]).toLowerCase();
    if (!primary) continue;

    discovered.add(primary);

    if (WRAPPER_COMMANDS.has(primary) && index + 1 < tokens.length) {
      const wrapped = sanitizeToken(tokens[index + 1]).toLowerCase();
      if (wrapped) {
        discovered.add(wrapped);
      }
    }
  }

  return Array.from(discovered);
}

function findBlockedCommands(
  command: string,
  sessionAllowedCommands?: Set<string>,
): string[] {
  const invoked = extractCommandNames(command);
  if (!invoked.length) return [];

  const allowList = getSecurityAllowList();
  if (
    !allowList.length &&
    (!sessionAllowedCommands || sessionAllowedCommands.size === 0)
  )
    return invoked;

  const allowSet = new Set(allowList);
  if (allowSet.has("*")) return [];

  return invoked.filter(
    (cmd) => !allowSet.has(cmd) && !sessionAllowedCommands?.has(cmd),
  );
}

export function isBlocked(
  command: string,
  sessionAllowedCommands?: Set<string>,
): boolean {
  const blocked = findBlockedCommands(command, sessionAllowedCommands);
  return blocked.length > 0;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes an arbitrary shell command
 * @param command - The command to execute (e.g., "cat abc.txt | grep 'abc@gmail.com'")
 * @param options - Optional execution options
 * @returns Promise with stdout, stderr, and exit code
 */
export async function executeCommand(
  command: string,
  options?: {
    cwd?: string;
    timeout?: number; // timeout in milliseconds
    maxBuffer?: number; // max buffer size in bytes
  },
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd: options?.cwd,
      timeout: options?.timeout,
      maxBuffer: options?.maxBuffer || 1024 * 1024, // default 1MB
      shell: EXECUTION_SHELL,
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error: unknown) {
    // exec throws an error if the command fails or times out
    const e = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      stdout: e.stdout?.trim() || "",
      stderr: e.stderr?.trim() || e.message || "",
      exitCode: e.code || 1,
    };
  }
}

export interface AbortableCommandResult extends CommandResult {
  wasAborted: boolean;
}

const SIGKILL_GRACE_MS = 200;

/**
 * Kill a process tree using negative PID (process group kill on Unix).
 * Falls back to direct kill if group kill fails.
 */
function killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (!proc.pid || proc.killed) return;
  try {
    // Negative PID kills the entire process group (Unix)
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      // Process may already be dead
    }
  }
}

/**
 * Executes a shell command with abort support.
 * Uses spawn with detached=true to create a process group for proper tree killing.
 * Returns both the promise and the child process handle.
 */
export function executeCommandAbortable(
  command: string,
  options?: {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
    signal?: AbortSignal;
  },
): { promise: Promise<AbortableCommandResult>; process: ChildProcess } {
  // Check if already aborted before spawning
  if (options?.signal?.aborted) {
    // Return a dummy process and a resolved result
    const dummyProc = spawn(process.execPath, ["-e", "process.exit(0)"]);
    dummyProc.kill();
    return {
      process: dummyProc,
      promise: Promise.resolve({
        stdout: "",
        stderr: "",
        exitCode: 130,
        wasAborted: true,
      }),
    };
  }

  const proc = spawn(command, [], {
    shell: EXECUTION_SHELL,
    cwd: options?.cwd,
    detached: process.platform !== "win32", // Create process group on Unix
    stdio: ["ignore", "pipe", "pipe"],
  });

  const promise = new Promise<AbortableCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let wasAborted = false;
    let exited = false;

    // Collect output
    proc.stdout?.on("data", (chunk: Buffer) => {
      const maxBuffer = options?.maxBuffer || 1024 * 1024;
      if (stdout.length < maxBuffer) {
        stdout += chunk.toString();
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const maxBuffer = options?.maxBuffer || 1024 * 1024;
      if (stderr.length < maxBuffer) {
        stderr += chunk.toString();
      }
    });

    // Abort handler
    const abortHandler = () => {
      wasAborted = true;
      killProcessTree(proc, "SIGTERM");
      // Force kill after grace period
      setTimeout(() => {
        if (!exited) {
          killProcessTree(proc, "SIGKILL");
        }
      }, SIGKILL_GRACE_MS);
    };

    if (options?.signal) {
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    // Timeout handler
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        wasAborted = true;
        killProcessTree(proc, "SIGTERM");
        setTimeout(() => {
          if (!exited) {
            killProcessTree(proc, "SIGKILL");
          }
        }, SIGKILL_GRACE_MS);
      }, options.timeout);
    }

    proc.once("exit", (code) => {
      exited = true;
      // Cleanup listeners
      if (options?.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (wasAborted) {
        stdout += "\n\n(Command was aborted)";
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        wasAborted,
      });
    });

    proc.once("error", (err) => {
      exited = true;
      if (options?.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        wasAborted,
      });
    });
  });

  return { promise, process: proc };
}

/**
 * Executes a command synchronously (blocking)
 * Use with caution - prefer executeCommand for async execution
 */
export function executeCommandSync(
  command: string,
  options?: {
    cwd?: string;
    timeout?: number;
  },
): CommandResult {
  try {
    const stdout = execSync(command, {
      cwd: options?.cwd,
      timeout: options?.timeout,
      encoding: "utf-8",
      shell: EXECUTION_SHELL,
    });

    return {
      stdout: stdout.trim(),
      stderr: "",
      exitCode: 0,
    };
  } catch (error: unknown) {
    const e = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    return {
      stdout: e.stdout?.toString().trim() || "",
      stderr: e.stderr?.toString().trim() || e.message || "",
      exitCode: e.status || 1,
    };
  }
}
