"use client"

import * as React from "react"

export type Theme = "light" | "paper" | "dark" | "system"
export type FontStyle = "serif" | "sans"
export type FontSize = "small" | "medium" | "large"

type ThemeContextProps = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  fontStyle: FontStyle
  setFontStyle: (style: FontStyle) => void
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
}

const ThemeContext = React.createContext<ThemeContextProps | null>(null)

const THEME_STORAGE_KEY = "scholaros-theme"
const FONT_STORAGE_KEY = "scholaros-font-style"
const FONT_SIZE_KEY = "scholaros-font-size"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.")
  }
  return context
}

export function ThemeProvider({
  defaultTheme = "system",
  children,
}: {
  defaultTheme?: Theme
  children: React.ReactNode
}) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
    return stored || defaultTheme
  })

  const [fontStyle, setFontStyleState] = React.useState<FontStyle>(() => {
    if (typeof window === "undefined") return "serif"
    const stored = localStorage.getItem(FONT_STORAGE_KEY) as FontStyle | null
    return stored || "serif"
  })

  const [fontSize, setFontSizeState] = React.useState<FontSize>(() => {
    if (typeof window === "undefined") return "medium"
    const stored = localStorage.getItem(FONT_SIZE_KEY) as FontSize | null
    return stored || "medium"
  })

  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(() => {
    if (theme === "system") return getSystemTheme()
    if (theme === "paper") return "light"
    return theme
  })

  // Apply theme class to document
  React.useEffect(() => {
    const root = document.documentElement
    const resolved = theme === "system" ? getSystemTheme() : (theme === "paper" ? "light" : theme)

    root.classList.remove("light", "dark", "paper")
    if (theme === "paper") {
      root.classList.add("paper")
    } else {
      root.classList.add(resolved)
    }
    setResolvedTheme(resolved)
  }, [theme])

  // Apply font style class to document
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("sans-typography", fontStyle === "sans")
  }, [fontStyle])

  // Apply font size to document
  React.useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize
  }, [fontSize])

  // Listen for system theme changes
  React.useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const resolved = getSystemTheme()
      document.documentElement.classList.remove("light", "dark", "paper")
      document.documentElement.classList.add(resolved)
      setResolvedTheme(resolved)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = React.useCallback((newTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    setThemeState(newTheme)
  }, [])

  const setFontStyle = React.useCallback((style: FontStyle) => {
    localStorage.setItem(FONT_STORAGE_KEY, style)
    setFontStyleState(style)
  }, [])

  const setFontSize = React.useCallback((size: FontSize) => {
    localStorage.setItem(FONT_SIZE_KEY, size)
    setFontSizeState(size)
  }, [])

  const contextValue = React.useMemo<ThemeContextProps>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      fontStyle,
      setFontStyle,
      fontSize,
      setFontSize,
    }),
    [theme, resolvedTheme, setTheme, fontStyle, setFontStyle, fontSize, setFontSize]
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}
