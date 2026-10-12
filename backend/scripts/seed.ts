import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import { listUsers, seedUsers, hydrateAuth } from '../src/services/authStore'
import { seedSessions } from '../src/services/sessionStore'
import { seedDefaultFacility, defaultFacilityId, hydrateFacilities } from '../src/services/facilityService'
import { ensureChainMetaForFacility } from '../src/services/auditStore'
import { seedDefaultSlaConfigs } from '../src/services/slaService'
import { seedGlobalSecurityPolicy } from '../src/services/passwordPolicyService'
import { seedGlobalConfidencePolicy } from '../src/services/confidencePolicyService'
import { setSeedMarker } from '../src/repositories/seedRepository'
import { drainWrites } from '../src/repositories/writeQueue'
import { SEED_VERSION, seedAppointmentDemoData } from '../src/db/bootstrap'

process.env.USE_IN_MEMORY_STORES = 'false'

async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:seed] connected to ${mongoUri()}`)
  await hydrateFacilities()
  await hydrateAuth()
  seedDefaultFacility()
  seedUsers()
  const owner = listUsers().find((u) => u.role === 'nurse') ?? listUsers()[0]
  seedSessions({ id: owner.id, displayName: owner.displayName })
  seedDefaultSlaConfigs()
  seedAppointmentDemoData()
  await seedGlobalSecurityPolicy()
  await seedGlobalConfidencePolicy()
  ensureChainMetaForFacility(defaultFacilityId())
  await drainWrites()
  await setSeedMarker('demo', SEED_VERSION)
  console.log(`[db:seed] demo dataset written (marker ${SEED_VERSION})`)
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:seed] failed:', err)
  process.exit(1)
})
