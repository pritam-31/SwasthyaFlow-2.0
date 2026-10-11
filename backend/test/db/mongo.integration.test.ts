import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { SeedMarkerModel } from '../../src/db/models/SeedMarker'
import { connectMongo, disconnectMongo } from '../../src/db/mongoose'
import { drainWrites } from '../../src/repositories/writeQueue'
import { getSeedMarker, setSeedMarker } from '../../src/repositories/seedRepository'
import { createUser, deleteUser, hydrateAuth, listUsers, verifyCredentials } from '../../src/services/authStore'

/**
 * Live-Mongo integration coverage. Self-skips unless a real database is wired
 * in, so `npm run test:db` stays green without one:
 *   USE_IN_MEMORY_STORES=false MONGODB_URI=mongodb://localhost:27017/swasthyaflow_test npm run test:db
 */
const mongoUri = process.env.MONGODB_URI
const enabled = Boolean(mongoUri) && process.env.USE_IN_MEMORY_STORES === 'false'

describe('mongo repositories — integration', { skip: enabled ? false : 'set MONGODB_URI + USE_IN_MEMORY_STORES=false to run' }, () => {
  before(async () => {
    process.env.USE_IN_MEMORY_STORES = 'false'
    await connectMongo(mongoUri)
  })

  after(async () => {
    await disconnectMongo()
    delete process.env.USE_IN_MEMORY_STORES
  })

  it('round-trips a seed marker', async () => {
    const name = `__test__-${Date.now()}`
    const version = `test-${Date.now()}`
    try {
      await setSeedMarker(name, version)
      assert.equal(await getSeedMarker(name), version)
    } finally {
      await SeedMarkerModel.deleteOne({ name })
    }
  })

  it('rehydrates a user record and verifies its password after reconnecting', async () => {
    const username = `mongo-${Date.now()}`
    const password = 'Persist9!Test'
    const user = createUser({ username, displayName: 'Mongo Persistence Check', password, role: 'patient' })
    try {
      await drainWrites()
      await disconnectMongo()
      await connectMongo(mongoUri)
      await hydrateAuth()

      assert.ok(listUsers().some((record) => record.id === user.id))
      assert.equal((await verifyCredentials(username, password)).id, user.id)
    } finally {
      if (listUsers().some((record) => record.id === user.id)) deleteUser(user.id)
      await drainWrites()
    }
  })
})
