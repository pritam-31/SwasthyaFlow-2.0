import { describe, expect, it } from 'vitest'
import { getDisplayName } from './displayName'

describe('getDisplayName', () => {
  it('falls back to "there" when nothing usable is provided', () => {
    expect(getDisplayName()).toBe('there')
    expect(getDisplayName(null, null)).toBe('there')
    expect(getDisplayName('', '')).toBe('there')
    expect(getDisplayName('  ')).toBe('there')
  })

  it('prefers an explicit firstName over the display name', () => {
    expect(getDisplayName('R. Sharma', 'Riya')).toBe('Riya')
    expect(getDisplayName('', 'Ananya')).toBe('Ananya')
  })

  it('greets "Ramesh Kumar" by first name', () => {
    expect(getDisplayName('Ramesh Kumar')).toBe('Ramesh')
  })

  it('strips a bare initial ("R. Sharma" → "Sharma")', () => {
    expect(getDisplayName('R. Sharma')).toBe('Sharma')
    expect(getDisplayName('S. Kiro')).toBe('Kiro')
  })

  it('keeps an honorific attached to the surname ("Dr. A. Mehta" → "Dr. Mehta")', () => {
    expect(getDisplayName('Dr. A. Mehta')).toBe('Dr. Mehta')
    expect(getDisplayName('Dr. Mehta')).toBe('Dr. Mehta')
    expect(getDisplayName('Mrs. Priya Rao')).toBe('Mrs. Rao')
  })

  it('drops relational/role titles ("Nurse R. Sharma" → "Sharma")', () => {
    expect(getDisplayName('Nurse R. Sharma')).toBe('Sharma')
    expect(getDisplayName('Sister Lata')).toBe('Lata')
  })

  it('never greets with a bare honorific or initial', () => {
    expect(getDisplayName('Dr.')).toBe('Doctor')
    expect(getDisplayName('R.')).toBe('there')
  })
})