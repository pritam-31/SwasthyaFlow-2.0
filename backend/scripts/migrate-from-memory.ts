import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import { listUsers, seedUsers } from '../src/services/authStore'
import { seedSessions } from '../src/services/sessionStore'
import { setSeedMarker } from '../src/repositories/seedRepository'
import { drainWrites } from '../src/repositories/writeQueue'
import { SEED_VERSION } from '../src/db/bootstrap'

/**
 * One-shot migration for a pre-persistence deployment: materialises the demo
 * dataset that used to live only in process memory into MongoDB. Idempotent —
 * re-running upserts the same rows.
 */
process.env.USE_IN_MEMORY_STORES = 'false'

async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:migrate-memory] connected to ${mongoUri()}`)
  seedUsers()
  const owner = listUsers().find((u) => u.role === 'nurse') ?? listUsers()[0]
  seedSessions({ id: owner.id, displayName: owner.displayName })
  await drainWrites()
  await setSeedMarker('demo', SEED_VERSION)
  console.log('[db:migrate-memory] in-memory dataset persisted')
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:migrate-memory] failed:', err)
  process.exit(1)
})
