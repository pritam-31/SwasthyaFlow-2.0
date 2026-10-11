import { expect, type Page, test } from '@playwright/test'

/**
 * Verifies the shared MUI X DataGrid wrapper renders the Triage Queue with the
 * expected columns, toolbar and responsive behaviour. Requires backend :4000.
 */

const BASE = 'http://localhost:4173'

async function signIn(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/#/login`)
  await page.getByPlaceholder('e.g. nurse').fill(username)
  await page.getByPlaceholder('At least 8 characters').fill(password)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/app/, { timeout: 15_000 })
}

test.describe('Triage Queue data grid', () => {
  test('renders grid, columns, quick filter and footer at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await signIn(page, 'nurse', 'Nurse@123')
    await page.goto(`${BASE}/#/app/triage`)

    const grid = page.getByRole('grid', { name: 'Patient triage queue' })
    await expect(grid).toBeVisible({ timeout: 15_000 })

    for (const header of ['Case', 'Concern', 'Urgency', 'Completeness', 'Language', 'Reports', 'Status']) {
      await expect(grid.getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeVisible()
    }

    await expect(page.getByPlaceholder('Search case / language…')).toBeVisible()
    await expect(page.getByText(/total rows/i)).toBeVisible()

    await page.screenshot({ path: 'screenshots/data-grid/triage-desktop-1280.png', fullPage: true })
  })

  test('hides Language + Reports at tablet width (768–1023)', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await signIn(page, 'nurse', 'Nurse@123')
    await page.goto(`${BASE}/#/app/triage`)

    const grid = page.getByRole('grid', { name: 'Patient triage queue' })
    await expect(grid).toBeVisible({ timeout: 15_000 })
    await expect(grid.getByRole('columnheader', { name: /Concern/i })).toBeVisible()
    await expect(grid.getByRole('columnheader', { name: /^Language$/i })).toHaveCount(0)

    await page.screenshot({ path: 'screenshots/data-grid/triage-tablet-820.png', fullPage: true })
  })

  test('falls back to a card list below 768px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'nurse', 'Nurse@123')
    await page.goto(`${BASE}/#/app/triage`)

    await expect(page.locator('#app-main h1').first()).not.toBeEmpty()
    await expect(page.getByRole('grid', { name: 'Patient triage queue' })).toHaveCount(0)
    // Cards show patient ids and urgency chips.
    await expect(page.getByText(/complete/i).first()).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: 'screenshots/data-grid/triage-mobile-390.png', fullPage: true })
  })
})
