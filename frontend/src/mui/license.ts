import { LicenseInfo } from '@mui/x-license'

/**
 * MUI X Pro licence bootstrap.
 *
 * The key is read from `VITE_MUI_X_LICENSE_KEY` (never hard-code a real key and
 * never commit it — see `.env.example`). Without a key the grids still render,
 * but MUI prints an evaluation watermark and a console warning. We surface a
 * single, friendlier note instead of leaving developers guessing.
 */
const key = import.meta.env.VITE_MUI_X_LICENSE_KEY as string | undefined

if (key && key.trim().length > 0) {
  LicenseInfo.setLicenseKey(key.trim())
} else if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    '[आरोग्य Sathi] VITE_MUI_X_LICENSE_KEY is not set — @mui/x-data-grid-pro runs in ' +
      'evaluation mode (watermark shown). Add the key to .env.local to silence this.',
  )
}

export const hasMuiXLicense = Boolean(key && key.trim().length > 0)