import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { cn } from "@/lib/utils";

interface TerminalPanelProps {
  tabId: string;
  command?: string; // Made optional - if not provided, spawns interactive shell
  cwd?: string;
  className?: string;
}

export function TerminalPanel({
  tabId,
  command,
  cwd,
  className,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const spawn = useCallback(async () => {
    // Cleanup previous instance if exists
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const term = new Terminal({
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
        selectionForeground: "#d4d4d4",
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (containerRef.current) {
      term.open(containerRef.current);
      // Small delay to let DOM settle before fitting
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // ignore fit errors
        }
      });
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Request main process to spawn PTY
    const ptyId = `${tabId}-${Date.now()}`;
    ptyIdRef.current = ptyId;

    try {
      await window.ipc.invoke("terminal:spawn", {
        ptyId,
        command: command || "", // If empty string, main process will spawn interactive shell
        cwd: cwd || undefined,
      });

      // Listen for data from PTY
      const removeData = window.ipc.on(
        "terminal:data",
        (payload: { ptyId: string; data: string }) => {
          if (payload.ptyId === ptyIdRef.current) {
            term.write(payload.data);
          }
        },
      );

      // Listen for exit
      const removeExit = window.ipc.on(
        "terminal:exit",
        (payload: { ptyId: string }) => {
          if (payload.ptyId === ptyIdRef.current) {
            term.write("\r\n[Process exited]\r\n");
          }
        },
      );

      // Send input to PTY
      term.onData((data) => {
        window.ipc.invoke("terminal:write", { ptyId, data }).catch(() => {});
      });

      // Handle resize
      const observer = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          const cols = term.cols;
          const rows = term.rows;
          window.ipc
            .invoke("terminal:resize", { ptyId, cols, rows })
            .catch(() => {});
        } catch {
          // ignore fit errors
        }
      });
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      // Store cleanup function
      cleanupRef.current = () => {
        removeData();
        removeExit();
        observer.disconnect();
        window.ipc.invoke("terminal:kill", { ptyId }).catch(() => {});
        term.dispose();
        cleanupRef.current = null;
      };
    } catch (err) {
      term.write(`\r\n[Failed to spawn terminal: ${String(err)}]\r\n`);
    }
  }, [tabId, command, cwd]);

  useEffect(() => {
    spawn();
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [spawn]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden bg-[#1e1e1e]", className)}
      data-terminal-panel={tabId}
    />
  );
}
