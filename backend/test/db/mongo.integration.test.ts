import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { connectMongo, disconnectMongo } from '../../src/db/mongoose'
import { getSeedMarker, setSeedMarker } from '../../src/repositories/seedRepository'

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
    const version = `test-${Date.now()}`
    await setSeedMarker('__test__', version)
    assert.equal(await getSeedMarker('__test__'), version)
  })
})
