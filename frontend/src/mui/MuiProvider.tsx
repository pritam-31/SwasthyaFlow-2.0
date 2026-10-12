import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { useMemo, type ReactNode } from 'react'
import { useThemeContext } from '../context/ThemeContext'
import { buildMuiTheme } from './theme'

/**
 * App-wide MUI setup. Kept intentionally thin:
 * - StyledEngineProvider(enableCssLayer, injectFirst) puts MUI's generated CSS in
 *   a low-priority `@layer mui`, so the existing Tailwind chassis keeps winning.
 * - No CssBaseline: Tailwind preflight already resets, so importing MUI's reset
 *   would fight it. MUI components are self-contained.
 * - The MUI palette follows the app-wide Light / Dark / System setting from
 *   `ThemeProvider`, so tables and controls always match the Tailwind chassis.
 */
export function MuiProvider({ children }: { children: ReactNode }) {
  const { resolved } = useThemeContext()

  const theme = useMemo(() => buildMuiTheme(resolved), [resolved])

  return (
    <StyledEngineProvider enableCssLayer injectFirst>
      <ThemeProvider theme={theme} defaultMode={resolved}>
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  )
}