import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import { seedDefaultFacility } from '../src/services/facilityService'
import { seedDefaultSlaConfigs } from '../src/services/slaService'
import { drainWrites } from '../src/repositories/writeQueue'

process.env.USE_IN_MEMORY_STORES = 'false'

/**
 * Writes the default SLA thresholds (critical/high/medium/low/routine) for every
 * facility that does not yet have a config. Safe to run repeatedly.
 */
async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:seed-sla] connected to ${mongoUri()}`)
  seedDefaultFacility()
  const seeded = seedDefaultSlaConfigs()
  await drainWrites()
  console.log(`[db:seed-sla] default SLA config written for ${seeded} facility(ies).`)
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:seed-sla] failed:', err)
  process.exit(1)
})
