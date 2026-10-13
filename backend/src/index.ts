import type { Server } from 'node:http'
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
  await initPersistenceWithRetry()
  ensureAuditChains()
  auditRuleRegistryLoad()

  const server = startServer(createApp())

  const shutdown = (signal: string): void => {
    console.log(`[api] ${signal} received — flushing writes and closing.`)
    stopPriorityScheduler()
    stopAuditVerificationScheduler()
    server.close(() => {
      void shutdownPersistence().finally(() => process.exit(0))
    })
    // Release idle keep-alive sockets (the Vite proxy holds them) so the port is
    // freed promptly for the next `tsx watch` restart instead of lingering.
    server.closeIdleConnections?.()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

/**
 * Binds the HTTP port, retrying briefly when it is still held by the previous
 * process. During fast dev restarts (`tsx watch`) the old process can hold port
 * 4000 for a moment; without a handler an `EADDRINUSE` emits an unhandled
 * `'error'` event that crashes the new process — leaving the dev proxy (and the
 * deployed URL) answering 502 on every request until a manual restart.
 */
function startServer(app: ReturnType<typeof createApp>): Server {
  const server = app.listen(PORT)
  let attempts = 0
  const maxAttempts = 20
  const retryDelayMs = 500

  server.on('listening', () => {
    console.log(`[api] आरोग्य Sathi backend listening on http://localhost:${PORT}`)
    console.log('[api] non-diagnostic prototype — no diagnosis, no prescriptions.')
    console.log('[api] anonymisation: unified P0-7 pipeline active across all modalities (en/hi/or).')
    startRetentionScheduler()
    startPriorityScheduler()
    startAuditVerificationScheduler()
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
      attempts += 1
      console.warn(`[api] port ${PORT} still busy (attempt ${attempts}/${maxAttempts}) — retrying in ${retryDelayMs}ms`)
      setTimeout(() => server.listen(PORT), retryDelayMs)
      return
    }
    console.error('[api] server error:', err instanceof Error ? err.message : err)
    process.exit(1)
  })

  return server
}

/**
 * Retries the whole persistence bootstrap so a transient Mongo/network outage
 * during startup does not permanently kill the server (which would leave the
 * dev proxy answering 502 on every request). `connectMongo` already retries the
 * initial handshake; this adds a second, coarser layer for hydrate failures.
 */
async function initPersistenceWithRetry(attempts = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initPersistence()
      return
    } catch (err) {
      console.error(
        `[api] startup attempt ${attempt}/${attempts} failed:`,
        err instanceof Error ? err.message : err,
      )
      if (attempt === attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
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
