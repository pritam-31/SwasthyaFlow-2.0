import { listActiveFacilities } from './facilityService'
import { addAudit, verifyAuditChain } from './auditStore'

/**
 * Optional nightly audit-chain verification (P2-16).
 *
 * Off by default; enabled with `AUDIT_VERIFY_SCHEDULER_ENABLED=true`. Interval
 * configurable with `AUDIT_VERIFY_INTERVAL_MINUTES` (default 1440 = daily). Every
 * run writes `audit.chain-verified`; a broken chain additionally writes a
 * `audit.chain-tampered` entry (which still appends — the append itself does not
 * depend on the chain being valid, and the verification result flags tampering).
 */

let timer: NodeJS.Timeout | null = null

export function auditVerificationSchedulerEnabled(): boolean {
  return process.env.AUDIT_VERIFY_SCHEDULER_ENABLED === 'true'
}

function intervalMs(): number {
  const minutes = Number(process.env.AUDIT_VERIFY_INTERVAL_MINUTES ?? '1440')
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 1440
  return safe * 60 * 1000
}

/** Verifies every active facility's chain once. Never throws. */
export function runAuditVerification(): void {
  for (const facility of listActiveFacilities()) {
    const result = verifyAuditChain(facility.id)
    const suffix = result.firstInvalidSequence !== undefined ? `, first invalid #${result.firstInvalidSequence}` : ''
    addAudit({
      facilityId: facility.id,
      sessionId: 'audit',
      actor: 'Audit verification scheduler',
      role: 'system-admin',
      action: 'audit.chain-verified',
      detail: `Hash chain ${result.valid ? 'valid' : 'INVALID'} — ${result.checkedEntries} entr${result.checkedEntries === 1 ? 'y' : 'ies'} checked${suffix}.`,
      category: 'system',
    })
    if (!result.valid) {
      addAudit({
        facilityId: facility.id,
        sessionId: 'audit',
        actor: 'Audit verification scheduler',
        role: 'system-admin',
        action: 'audit.chain-tampered',
        detail: `Tamper detected at sequence #${result.firstInvalidSequence ?? 0} (${result.reason ?? 'unknown reason'}).`,
        category: 'system',
      })
    }
  }
}

export function startAuditVerificationScheduler(): void {
  if (!auditVerificationSchedulerEnabled() || timer) return
  timer = setInterval(() => {
    try {
      runAuditVerification()
    } catch (err) {
      console.error('[api] audit verification failed:', err instanceof Error ? err.message : err)
    }
  }, intervalMs())
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopAuditVerificationScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
