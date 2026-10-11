import { expect, type Page, test } from '@playwright/test'

/**
 * Locks in the P0 fix (nested absolute routes crashing the router) and the
 * role-scoping rules. Requires the backend on :4000 (see playwright.config).
 */

const BASE = 'http://localhost:4173'

/** Nav-visible destinations that the nurse + doctor roles may open. */
const STAFF_ROUTES = [
  { to: '/app', title: 'Dashboard' },
  { to: '/app/triage', title: 'Triage Queue' },
  { to: '/app/review', title: 'Reviewer Workspace' },
  { to: '/app/cases', title: 'Patients' },
  { to: '/app/new-intake', title: 'New Intake' },
  { to: '/app/referrals', title: 'Referrals' },
  { to: '/app/followups', title: 'Follow-ups' },
  { to: '/app/camps', title: 'Health Camps' },
  { to: '/app/security', title: 'Security' },
  { to: '/app/model-card', title: 'Model Cards' },
  { to: '/app/feedback', title: 'Feedback' },
  { to: '/app/data-privacy', title: 'Data & Privacy' },
]

const ADMIN_ONLY_ROUTES = [
  { to: '/app/analytics', title: 'Analytics' },
  { to: '/app/audit', title: 'Audit Logs' },
  { to: '/app/users', title: 'Users' },
  { to: '/app/facilities', title: 'Facilities' },
  { to: '/app/settings', title: 'Settings' },
  { to: '/app/bias', title: 'Bias Evaluation' },
]

async function signIn(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/#/login`)
  await page.getByPlaceholder('e.g. nurse').fill(username)
  await page.getByPlaceholder('At least 8 characters').fill(password)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/app/, { timeout: 15_000 })
}

/** Every route must render real content (non-empty h1 in #app-main). */
async function assertRouteRenders(page: Page, to: string, title: string) {
  await page.goto(`${BASE}/#${to}`)
  await expect(page.locator('#app-main')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#app-main h1').first()).not.toBeEmpty()
  await expect(page).toHaveTitle(new RegExp(title))
}

test.describe('P0 routing regression (nurse session)', () => {
  test('sidebar navigation swaps the main pane instead of stalling on the dashboard', async ({ page }) => {
    await signIn(page, 'nurse', 'Nurse@123')

    // Landing: dashboard header (PageHeader h1) is present.
    await expect(page.locator('h1', { hasText: 'Operations Dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /Hi Sharma/ })).toBeVisible()

    // Walking every staff route must change the heading and document title.
    for (const r of STAFF_ROUTES) {
      await assertRouteRenders(page, r.to, r.title)
      if (r.to === '/app/triage') {
        await expect(page.locator('#app-main h1')).toContainText('Triage')
      }
    }

    // A staff member cannot open admin-only routes: they bounce back to /app.
    await page.goto(`${BASE}/#/app/users`)
    await expect(page).toHaveURL(/#\/app$/)
    await expect(page.locator('h1', { hasText: 'Operations Dashboard' })).toBeVisible()
  })
})

test.describe('Role scoping', () => {
  test('patient never reaches staff queues', async ({ page }) => {
    await signIn(page, 'patient', 'Patient@123')

    // Patient dashboard is self-service, not the staff overview.
    await expect(page.locator('h1', { hasText: /Your care/ })).toBeVisible()
    await expect(page.locator('h1', { hasText: 'Operations Dashboard' })).toBeHidden()

    // Deep-linking to a staff route redirects home with a toast.
    await page.goto(`${BASE}/#/app/triage`)
    await expect(page).toHaveURL(/#\/app$/)
    await expect(page.getByText("You don't have access to that page.")).toBeVisible()
  })

  test('admin can open admin-only destinations', async ({ page }) => {
    await signIn(page, 'admin', 'Admin@123')
    for (const r of ADMIN_ONLY_ROUTES) {
      await assertRouteRenders(page, r.to, r.title)
    }
  })
})

test.describe('Account menu', () => {
  test('signs out from the profile menu (desktop rail)', async ({ page }) => {
    await signIn(page, 'doctor', 'Doctor@123')

    const avatar = page.getByRole('button', { name: 'Account and sign out' })
    await expect(avatar).toBeVisible()
    await avatar.click()
    await expect(page.getByRole('menu', { name: 'Account menu' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/#\/login/, { timeout: 15_000 })
  })
})