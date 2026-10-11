import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri, persistenceEnabled } from '../src/db/mongoose'
import { drainWrites } from '../src/repositories/writeQueue'
import { addAudit, backfillAuditChain, countAuditEntries, hydrateAudit } from '../src/services/auditStore'

/**
 * One-time migration (P2-16): backfill the per-facility hash chain for audit
 * entries written before the chain existed.
 *
 * Idempotent — facilities whose entries already carry a valid hash are skipped,
 * so running it twice changes nothing. Writes `audit.chain-initialised` per
 * facility and `audit.chain-backfilled` with the totals.
 */

process.env.USE_IN_MEMORY_STORES = 'false'

async function run(): Promise<void> {
  if (!persistenceEnabled()) throw new Error('Backfill requires persistent mode (USE_IN_MEMORY_STORES=false).')
  await connectMongo()
  console.log(`[db:backfill-audit-chain] connected to ${mongoUri()}`)

  await hydrateAudit()
  const before = countAuditEntries()
  const result = backfillAuditChain()

  for (const facilityId of result.facilities) {
    addAudit({
      facilityId,
      sessionId: 'audit',
      actor: 'Audit chain backfill',
      role: 'system-admin',
      action: 'audit.chain-initialised',
      detail: 'Hash chain initialised for this facility during the one-time backfill.',
      category: 'system',
    })
  }
  addAudit({
    sessionId: 'audit',
    actor: 'Audit chain backfill',
    role: 'system-admin',
    action: 'audit.chain-backfilled',
    detail: `Backfilled ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'} across ${result.facilities.length} facilit${result.facilities.length === 1 ? 'y' : 'ies'} (of ${before} loaded).`,
    category: 'system',
  })

  await drainWrites()
  console.log(`[db:backfill-audit-chain] chained ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'} across ${result.facilities.length} facilit${result.facilities.length === 1 ? 'y' : 'ies'}.`)
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:backfill-audit-chain] failed:', err)
  process.exit(1)
})
