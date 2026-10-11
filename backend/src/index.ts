import { createApp } from './app'
import { initPersistence, shutdownPersistence } from './db/bootstrap'
import { startRetentionScheduler } from './services/retentionScheduler'
import { startPriorityScheduler, stopPriorityScheduler } from './services/priorityScheduler'
import { addAudit, backfillAuditChain, ensureChainForFacilities } from './services/auditStore'
import { startAuditVerificationScheduler, stopAuditVerificationScheduler } from './services/auditVerificationScheduler'
import { listActiveFacilities } from './services/facilityService'
import { auditRuleRegistryLoad } from './services/rules/ruleRegistry'

function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 4000
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[api] Invalid PORT "${raw}" — falling back to 4000.`)
    return 4000
  }
  return parsed
}

const PORT = resolvePort(process.env.PORT)

async function main(): Promise<void> {
  await initPersistence()
  ensureAuditChains()
  auditRuleRegistryLoad()

  const server = createApp().listen(PORT, () => {
    console.log(`[api] SwasthyaFlow backend listening on http://localhost:${PORT}`)
    console.log('[api] non-diagnostic prototype — no diagnosis, no prescriptions.')
    console.log('[api] anonymisation: unified P0-7 pipeline active across all modalities (en/hi/or).')
    console.log('[api] demo logins: admin/Admin@123 · nurse/Nurse@123 · doctor/Doctor@123 · patient/Patient@123')
    startRetentionScheduler()
    startPriorityScheduler()
    startAuditVerificationScheduler()
  })

  const shutdown = (signal: string): void => {
    console.log(`[api] ${signal} received — flushing writes and closing.`)
    stopPriorityScheduler()
    stopAuditVerificationScheduler()
    server.close(() => {
      void shutdownPersistence().finally(() => process.exit(0))
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

/**
 * Audit chain boot (P2-16): rebuild heads, then run the one-time backfill for any
 * facility holding legacy (unchained) entries. Idempotent — a facility whose
 * entries all carry a valid hash is skipped, so restarts are cheap.
 */
function ensureAuditChains(): void {
  ensureChainForFacilities(listActiveFacilities().map((facility) => facility.id))
  const backfill = backfillAuditChain()
  for (const facilityId of backfill.facilities) {
    addAudit({
      facilityId,
      sessionId: 'audit',
      actor: 'System migration',
      role: 'system-admin',
      action: 'audit.chain-initialised',
      detail: 'Audit hash chain initialised from existing entries (genesis + backfill).',
      category: 'system',
    })
  }
  if (backfill.entries > 0) {
    console.log(`[api] audit chain: backfilled ${backfill.entries} entr${backfill.entries === 1 ? 'y' : 'ies'} across ${backfill.facilities.length} facility(ies).`)
  }
}

main().catch((err) => {
  console.error('[api] Failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
