import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PaletteMode } from '@mui/material'
import { buildMuiTheme } from './theme'

/**
 * App-wide MUI setup. Kept intentionally thin:
 * - StyledEngineProvider(enableCssLayer, injectFirst) puts MUI's generated CSS in
 *   a low-priority `@layer mui`, so the existing Tailwind chassis keeps winning.
 * - No CssBaseline: Tailwind preflight already resets, so importing MUI's reset
 *   would fight it. MUI components are self-contained.
 * - Mode follows the OS `prefers-color-scheme` (there is no app theme switch yet);
 *   it only affects MUI widgets, never the Tailwind chrome.
 */

interface MuiModeContextValue {
  mode: PaletteMode
  setMode: (mode: PaletteMode) => void
}

const MuiModeContext = createContext<MuiModeContextValue>({ mode: 'light', setMode: () => {} })

export function useMuiMode() {
  return useContext(MuiModeContext)
}

function usePrefersDark() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDark(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

export function MuiProvider({ children }: { children: ReactNode }) {
  const prefersDark = usePrefersDark()
  const [override, setOverride] = useState<PaletteMode | null>(null)
  const mode: PaletteMode = override ?? (prefersDark ? 'dark' : 'light')

  const theme = useMemo(() => buildMuiTheme(mode), [mode])
  const contextValue = useMemo<MuiModeContextValue>(() => ({ mode, setMode: setOverride }), [mode])

  return (
    <StyledEngineProvider enableCssLayer injectFirst>
      <ThemeProvider theme={theme} defaultMode={mode}>
        <MuiModeContext.Provider value={contextValue}>{children}</MuiModeContext.Provider>
      </ThemeProvider>
    </StyledEngineProvider>
  )
}