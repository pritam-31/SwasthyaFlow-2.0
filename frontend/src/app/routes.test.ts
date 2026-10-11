import { describe, expect, it } from 'vitest'
import {
  ADMIN_ROLES,
  APP_ROUTES,
  canAccess,
  CLINICAL_ROLES,
  EVERYONE,
  matchAppRoute,
  navRoutesForRole,
} from '../app/routes'

describe('APP_ROUTES', () => {
  it('uses only relative (non-absolute) paths so nested Routes never throw', () => {
    for (const r of APP_ROUTES) {
      expect(r.path, r.to).not.toMatch(/^\//)
    }
  })

  it('keeps `to` and `path` in sync', () => {
    for (const r of APP_ROUTES) {
      expect(r.to, r.path).toMatch(/^\/app/)
      if (r.path === '') {
        expect(r.to, r.path).toBe('/app')
      } else if (!r.path.includes(':')) {
        // Declared alias (/app/intake) points at the canonical destination.
        const expected = `/app/${r.path}`
        expect(r.to, r.path).toBe(expected === '/app/intake' ? '/app/new-intake' : expected)
      } else {
        // Parameterised routes (cases/:caseId) point at their parent listing.
        expect(r.to, r.path).toBe(`/app/${r.path.split('/')[0]}`)
      }
    }
  })

  it('has exactly one index route and it is the dashboard', () => {
    const index = APP_ROUTES.filter((r) => r.path === '')
    expect(index).toHaveLength(1)
    expect(index[0].Component).toBeTruthy()
  })

  it('does not duplicate nav destinations', () => {
    const seen = new Set<string>()
    for (const r of APP_ROUTES.filter((r) => r.nav)) {
      expect(seen.has(r.to), `duplicate nav destination ${r.to}`).toBe(false)
      seen.add(r.to)
    }
  })

  it('declares redirect aliases as non-nav', () => {
    const alias = APP_ROUTES.find((r) => r.path === 'intake')
    expect(alias).toBeDefined()
    expect(alias?.nav).toBe(false)
    expect(alias?.to).toBe('/app/new-intake')
  })

  it('scopes every route to allowed roles and keeps role lists in sync', () => {
    for (const r of APP_ROUTES) {
      expect(r.roles.length, r.to).toBeGreaterThan(0)
      expect(r.roles.every((role) => EVERYONE.includes(role)), `unknown role on ${r.to}`).toBe(true)
    }
    expect(CLINICAL_ROLES).not.toContain('patient')
    expect(ADMIN_ROLES.every((r) => CLINICAL_ROLES.includes(r))).toBe(true)
  })
})

describe('canAccess / navRoutesForRole', () => {
  it('grants triage to staff but not patients', () => {
    expect(canAccess('nurse', CLINICAL_ROLES)).toBe(true)
    expect(canAccess('doctor', CLINICAL_ROLES)).toBe(true)
    expect(canAccess('patient', CLINICAL_ROLES)).toBe(false)
  })

  it('restricts analytics to admins', () => {
    expect(canAccess('admin', ADMIN_ROLES)).toBe(true)
    expect(canAccess('nurse', ADMIN_ROLES)).toBe(false)
  })

  it('patients get self-service nav only', () => {
    const tos = navRoutesForRole('patient').map((r) => r.to)
    expect(tos).toContain('/app')
    expect(tos).toContain('/app/cases')
    expect(tos).toContain('/app/new-intake')
    expect(tos).toContain('/app/followups')
    expect(tos).not.toContain('/app/triage')
    expect(tos).not.toContain('/app/referrals')
    expect(tos).not.toContain('/app/analytics')
  })

  it('nurses see clinical sections, not admin-only ones', () => {
    const tos = navRoutesForRole('nurse').map((r) => r.to)
    expect(tos).toContain('/app/triage')
    expect(tos).not.toContain('/app/analytics')
    expect(tos).not.toContain('/app/users')
  })

  it('admins see the full operational set', () => {
    const tos = navRoutesForRole('admin').map((r) => r.to)
    expect(tos).toContain('/app/analytics')
    expect(tos).toContain('/app/users')
    expect(tos).toContain('/app/triage')
  })
})

describe('matchAppRoute', () => {
  it('resolves the index and simple paths', () => {
    expect(matchAppRoute('/app')?.path).toBe('')
    expect(matchAppRoute('/app/triage')?.path).toBe('triage')
    expect(matchAppRoute('/app/cases')?.path).toBe('cases')
  })

  it('resolves parameterised case detail routes', () => {
    const r = matchAppRoute('/app/cases/case-0001')
    expect(r?.path).toBe('cases/:caseId')
  })

  it('returns undefined for unknown paths', () => {
    expect(matchAppRoute('/app/definitely-not-a-page')).toBeUndefined()
  })
})