import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { useMemo, type ReactNode } from 'react'
import { useThemeContext } from '../context/ThemeContext'
import { buildMuiTheme } from './theme'

/**
 * App-wide MUI setup. Kept intentionally thin:
 * - StyledEngineProvider(injectFirst) injects MUI's generated CSS into <head>
 *   ahead of the Tailwind stylesheet, so Tailwind utilities still win where both
 *   set the same property.
 *   We deliberately do NOT use `enableCssLayer`: emotion emits some MUI rules
 *   (e.g. the DataGrid styles) as `@layer mui` blocks *before* the Tailwind
 *   stylesheet loads, which makes `mui` the lowest-priority layer. Tailwind's
 *   preflight (`* { padding: 0; border: 0 }`, in `@layer base`) then overrides
 *   MUI and strips DataGrid cell padding/borders — the rows and columns
 *   visually collapse into each other. Without layers, normal specificity lets
 *   MUI's class selectors beat the `*` preflight reset.
 * - No CssBaseline: Tailwind preflight already resets, so importing MUI's reset
 *   would fight it. MUI components are self-contained.
 * - The MUI palette follows the app-wide Light / Dark / System setting from
 *   `ThemeProvider`, so tables and controls always match the Tailwind chassis.
 */
export function MuiProvider({ children }: { children: ReactNode }) {
  const { resolved } = useThemeContext()

  const theme = useMemo(() => buildMuiTheme(resolved), [resolved])

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme} defaultMode={resolved}>
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  )
}