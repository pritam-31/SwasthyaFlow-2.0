import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { scrubRawMatch, scrubRawReport } from '../../src/db/serializers'
import { enqueue, drainWrites } from '../../src/repositories/writeQueue'
import { mongoUri, persistenceEnabled, seedOnBoot, storesInMemory } from '../../src/db/mongoose'

describe('persistence layer — pure helpers', () => {
  it('scrubRawMatch removes the raw PII span', () => {
    const scrubbed = scrubRawMatch({
      category: 'person-name',
      modality: 'intake-text',
      span: { start: 0, end: 4 },
      raw: 'Asha',
      replacement: '[NAME REDACTED]',
      confidence: 0.9,
      language: 'en',
    })
    assert.equal('raw' in scrubbed, false)
    assert.equal(scrubbed.replacement, '[NAME REDACTED]')
  })

  it('scrubRawReport strips raw from every match', () => {
    const report = scrubRawReport({
      id: 'r1',
      sourceModality: 'report-text',
      matches: [
        { category: 'person-name', modality: 'intake-text', span: { start: 0, end: 2 }, raw: 'Jo', replacement: '[NAME REDACTED]', confidence: 0.8, language: 'en' },
      ],
      redactedCount: 1,
      warnings: [],
      coverage: { totalCandidates: 1, redacted: 1, skipped: 0, unknown: 0, coverageRatio: 1 },
      createdAt: new Date().toISOString(),
      actorId: 'u1',
      actorRole: 'nurse',
    })
    assert.equal(report.matches.length, 1)
    assert.equal('raw' in report.matches[0], false)
  })

  it('write queue preserves per-key order and resolves on drain', async () => {
    const order: number[] = []
    enqueue('order', async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push(1)
    })
    enqueue('order', async () => {
      order.push(2)
    })
    await drainWrites()
    assert.deepEqual(order, [1, 2])
  })

  it('defaults to in-memory stores', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previous = process.env.USE_IN_MEMORY_STORES
    process.env.NODE_ENV = 'test'
    delete process.env.USE_IN_MEMORY_STORES
    assert.equal(storesInMemory(), true)
    assert.equal(persistenceEnabled(), false)
    process.env.USE_IN_MEMORY_STORES = 'false'
    assert.equal(persistenceEnabled(), true)
    if (previous === undefined) delete process.env.USE_IN_MEMORY_STORES
    else process.env.USE_IN_MEMORY_STORES = previous
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  })

  it('requires persistent Mongo storage and disables demo seeding in production', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousMemorySetting = process.env.USE_IN_MEMORY_STORES
    const previousMongoUri = process.env.MONGODB_URI
    process.env.NODE_ENV = 'production'
    process.env.USE_IN_MEMORY_STORES = 'true'
    delete process.env.MONGODB_URI
    try {
      assert.equal(storesInMemory(), false)
      assert.equal(persistenceEnabled(), true)
      assert.equal(seedOnBoot(), false)
      assert.throws(() => mongoUri(), /MONGODB_URI is required/)
      process.env.MONGODB_URI = 'mongodb+srv://<configured-at-deploy>'
      assert.equal(mongoUri(), 'mongodb+srv://<configured-at-deploy>')
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousMemorySetting === undefined) delete process.env.USE_IN_MEMORY_STORES
      else process.env.USE_IN_MEMORY_STORES = previousMemorySetting
      if (previousMongoUri === undefined) delete process.env.MONGODB_URI
      else process.env.MONGODB_URI = previousMongoUri
    }
  })
})
