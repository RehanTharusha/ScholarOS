import { exec, execSync } from "child_process";
import { promisify } from "util";
import {
  getSecurityAllowList,
  SECURITY_CONFIG_PATH,
} from "../../config/security.js";
import { getExecutionShell } from "../assistant/runtime-context.js";

const execPromise = promisify(exec);
const COMMAND_SPLIT_REGEX = /(?:\|\||&&|;|\||\n)/;
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
  return token.trim().replace(/^['"]+|['"]+$/g, "");
}

function extractCommandNames(command: string): string[] {
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

function findBlockedCommands(command: string): string[] {
  const invoked = extractCommandNames(command);
  if (!invoked.length) return [];

  const allowList = getSecurityAllowList();
  if (!allowList.length) return invoked;

  const allowSet = new Set(allowList);
  if (allowSet.has("*")) return [];

  return invoked.filter((cmd) => !allowSet.has(cmd));
}

// export const BlockedResult = {
//   stdout: '',
//   stderr: `Command blocked by security policy. Update ${SECURITY_CONFIG_PATH} to allow them before retrying.`,
//   exitCode: 126,
// };

export function isBlocked(command: string): boolean {
  const blocked = findBlockedCommands(command);
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
  } catch (error: any) {
    // exec throws an error if the command fails or times out
    return {
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || error.message,
      exitCode: error.code || 1,
    };
  }
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
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString().trim() || "",
      stderr: error.stderr?.toString().trim() || error.message,
      exitCode: error.status || 1,
    };
  }
}
