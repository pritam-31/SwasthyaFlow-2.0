import { expect, test } from '@playwright/test'

/**
 * Proof that the "AI ASSISTANCE ONLY" banner is gone everywhere:
 * - logs in as each seeded role,
 * - visits every route that role may open (plus the login + landing shells),
 * - asserts the banner text / aria-label / long phrase are absent on each one,
 * - captures a screenshot per route into screenshots/banner-removed/<role>/.
 * Requires the backend on :4000 (see playwright.config).
 */

const BASE = 'http://localhost:4173'
const BANNER_ARIA = 'Non-diagnostic system notice'
const BANNER_LONG = 'This prototype organizes patient information'
const SHOT_ROOT = 'screenshots/banner-removed'

const PATIENT_ROUTES = ['/app', '/app/cases/case-0001', '/app/new-intake', '/app/followups', '/app/security', '/app/model-card', '/app/feedback', '/app/data-privacy']
const CLINICAL_ROUTES = ['/app/triage', '/app/review', '/app/reports', '/app/referrals', '/app/camps']
const ADMIN_ROUTES = ['/app/analytics', '/app/audit', '/app/users', '/app/facilities', '/app/settings', '/app/bias']

const ROLES = [
  { username: 'patient', password: 'Patient@123', routes: PATIENT_ROUTES },
  { username: 'nurse', password: 'Nurse@123', routes: [...PATIENT_ROUTES, ...CLINICAL_ROUTES] },
  { username: 'doctor', password: 'Doctor@123', routes: [...PATIENT_ROUTES, ...CLINICAL_ROUTES] },
  { username: 'admin', password: 'Admin@123', routes: [...PATIENT_ROUTES, ...CLINICAL_ROUTES, ...ADMIN_ROUTES] },
]

function fileSafe(pathname: string) {
  return pathname.replace(/^\/app/, '').split('/').filter(Boolean).join('-') || 'dashboard'
}

async function signIn(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('form input[placeholder="e.g. nurse"]').fill(username)
  await page.locator('form input[placeholder="At least 8 characters"]').fill(password)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/app/, { timeout: 15_000 })
}

async function assertNoBanner(page: import('@playwright/test').Page) {
  await expect(page.getByLabel(BANNER_ARIA)).toHaveCount(0)
  await expect(page.getByText(BANNER_LONG, { exact: false })).toHaveCount(0)
  await expect(page.getByText('AI ASSISTANCE ONLY', { exact: false })).toHaveCount(0)
}

test('login and landing shells show no banner', async ({ page }) => {
  await page.goto(`${BASE}/#/login`)
  await expect(page.getByRole('heading', { name: 'Human-in-the-loop triage for frontline health teams.' })).toBeVisible()
  await assertNoBanner(page)
  await page.screenshot({ path: `${SHOT_ROOT}/login/login.png`, fullPage: true })

  await page.goto(`${BASE}/`)
  await expect(page.getByText('Safety stance')).toBeVisible()
  // Landing's marketing card headline is NOT the banner bar; assert only the
  // banner bar's distinct signals (aria-label + long prototype phrasing).
  await expect(page.getByLabel(BANNER_ARIA)).toHaveCount(0)
  await expect(page.getByText(BANNER_LONG, { exact: false })).toHaveCount(0)
  await page.screenshot({ path: `${SHOT_ROOT}/landing/landing.png`, fullPage: true })
})

for (const { username, password, routes } of ROLES) {
  test(`${username} sees no banner on any accessible route`, async ({ page }) => {
    test.setTimeout(180_000)
    await signIn(page, username, password)
    for (const to of routes) {
      await page.goto(`${BASE}/#${to}`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#app-main')).toBeVisible({ timeout: 10_000 })
      await assertNoBanner(page)
      await page.screenshot({ path: `${SHOT_ROOT}/${username}/${fileSafe(to)}.png`, fullPage: true })
    }
  })
}