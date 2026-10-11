import { createTheme, type Theme } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'

/**
 * MUI theme derived from the app's Tailwind design tokens (see src/index.css).
 * The app chassis is Tailwind; MUI is applied app-wide but layered underneath
 * (StyledEngineProvider enableCssLayer) so existing styles are untouched.
 */

export const brand = {
  50: '#effaf7',
  100: '#d8f1ea',
  200: '#b0e3d5',
  300: '#7ccdb9',
  400: '#48b39c',
  500: '#2b9a85',
  600: '#1f7d6b',
  700: '#1a6457',
  800: '#164f46',
  900: '#12413a',
}

export const ink = {
  50: '#f7f9fb',
  100: '#eef2f6',
  200: '#e1e7ee',
  300: '#cdd6e0',
  400: '#94a1b2',
  500: '#64748a',
  600: '#46566e',
  700: '#35425a',
  800: '#232f42',
  900: '#141c2b',
}

export const lime = {
  200: '#d9f99d',
  300: '#bef264',
  400: '#a3e635',
  500: '#84cc16',
}

/** Status accents shared by grids, chips and mini-charts. */
export const status = {
  urgent: '#e11d48',
  prompt: '#f59e0b',
  routine: '#2b9a85',
  emerald: '#059669',
  sky: '#0284c7',
  violet: '#7c3aed',
}

const fontFamily = [
  '"Inter Variable"',
  '"Inter"',
  'ui-sans-serif',
  'system-ui',
  '-apple-system',
  '"Segoe UI"',
  'Roboto',
  '"Noto Sans"',
  '"Noto Sans Devanagari"',
  '"Noto Sans Oriya"',
  'sans-serif',
].join(', ')

export function buildMuiTheme(mode: PaletteMode): Theme {
  const dark = mode === 'dark'

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: {
        main: brand[600],
        light: brand[300],
        dark: brand[800],
        contrastText: '#ffffff',
      },
      secondary: {
        main: dark ? lime[400] : ink[900],
        light: ink[600],
        dark: ink[900],
        contrastText: dark ? ink[900] : '#ffffff',
      },
      success: { main: status.emerald, contrastText: '#ffffff' },
      warning: { main: status.prompt },
      error: { main: status.urgent },
      info: { main: status.sky },
      background: {
        default: dark ? '#0b0f16' : '#f5f7fa',
        paper: dark ? '#111721' : '#ffffff',
      },
      text: {
        primary: dark ? '#e6ebf2' : ink[900],
        secondary: dark ? '#94a1b2' : ink[500],
        disabled: dark ? '#5b6678' : ink[400],
      },
      divider: dark ? '#1f2a3a' : ink[200],
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily,
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 700 },
    },
    spacing: 8,
    components: {
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
      },
      // Keep the global focus ring on-brand instead of the default browser blue.
      MuiCssBaseline: {
        styleOverrides: {
          '*:focus-visible': {
            outline: `2px solid ${brand[500]}`,
            outlineOffset: 2,
          },
        },
      },
    },
  })
}

export const lightTheme = buildMuiTheme('light')
export const darkTheme = buildMuiTheme('dark')
