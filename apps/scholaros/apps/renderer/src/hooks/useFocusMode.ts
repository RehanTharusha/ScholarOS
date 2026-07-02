import { useState, useCallback, useEffect } from "react";

/**
 * Hook for managing focus/zen mode state.
 *
 * Focus mode hides the left sidebar, right chat sidebar, and tab bar
 * to provide a distraction-free writing/reading experience.
 *
 * Keyboard shortcut: Cmd+Shift+F (macOS) / Ctrl+Shift+F (other platforms)
 */
export function useFocusMode() {
  const [isFocusMode, setIsFocusMode] = useState(false);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  const enableFocusMode = useCallback(() => {
    setIsFocusMode(true);
  }, []);

  const disableFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  // Keyboard shortcut: Cmd+Shift+F / Ctrl+Shift+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsFocusMode((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isFocusMode,
    toggleFocusMode,
    enableFocusMode,
    disableFocusMode,
  };
}
