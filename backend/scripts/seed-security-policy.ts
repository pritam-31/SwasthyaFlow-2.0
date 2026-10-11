import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import { seedGlobalSecurityPolicy } from '../src/services/passwordPolicyService'
import { drainWrites } from '../src/repositories/writeQueue'

process.env.USE_IN_MEMORY_STORES = 'false'

/**
 * Seeds the global (default) security policy document. Safe to run repeatedly —
 * `seedGlobalSecurityPolicy` upserts the global facility row without clobbering
 * an already-customised policy's audit stamp.
 */
async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:seed-security-policy] connected to ${mongoUri()}`)
  await seedGlobalSecurityPolicy()
  await drainWrites()
  console.log('[db:seed-security-policy] global security policy ensured')
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:seed-security-policy] failed:', err)
  process.exit(1)
})
