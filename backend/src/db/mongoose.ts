import 'dotenv/config'
import mongoose from 'mongoose'

/**
 * MongoDB connection lifecycle (P1-9).
 *
 * Development/tests may opt into the prototype's in-memory stores. Production
 * always uses Mongo-backed repositories and fails startup if Mongo is absent.
 */

export interface DbHealth {
  enabled: boolean
  connected: boolean
  state: string
  host?: string
  useInMemoryStores: boolean
}

let connected = false
let connecting: Promise<typeof mongoose> | null = null

/** Production always persists; local/test runs remain in-memory by default. */
export function storesInMemory(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.USE_IN_MEMORY_STORES !== 'false'
}

/** True when the in-memory stores should mirror their writes to Mongo. */
export function persistenceEnabled(): boolean {
  return !storesInMemory()
}

export function mongoUri(): string {
  const configured = process.env.MONGODB_URI?.trim()
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('MONGODB_URI is required when running in production.')
  }
  return configured || 'mongodb://localhost:27017/swasthyaflow'
}

export function seedOnBoot(): boolean {
  if (process.env.NODE_ENV === 'production') return process.env.SEED_ON_BOOT === 'true'
  return process.env.SEED_ON_BOOT !== 'false'
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1
}

export async function connectMongo(uri: string = mongoUri()): Promise<typeof mongoose> {
  if (connected) return mongoose
  if (connecting) return connecting
  mongoose.set('strictQuery', true)
  const open = async (): Promise<void> => {
    connecting = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME?.trim() || 'swasthyaflow',
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production',
    })
    try {
      await connecting
      connected = true
    } finally {
      connecting = null
    }
  }
  // A transient network / DNS / Atlas blip at boot must not kill the server.
  // Retry the initial handshake with backoff before giving up.
  const maxAttempts = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await open()
      return mongoose
    } catch (err) {
      lastErr = err
      console.error(
        `[db] Mongo connection failed (attempt ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err,
      )
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }
  throw lastErr
}

export async function disconnectMongo(): Promise<void> {
  if (!connected) return
  connected = false
  await mongoose.disconnect()
}

export function dbHealth(): DbHealth {
  const connection = mongoose.connection
  const stateName =
    connection.readyState === 1
      ? 'connected'
      : connection.readyState === 2
        ? 'connecting'
        : connection.readyState === 3
          ? 'disconnecting'
          : 'disconnected'
  return {
    enabled: !storesInMemory(),
    connected: connection.readyState === 1,
    state: stateName,
    ...(connection.host ? { host: `${connection.host}:${connection.port}/${connection.name}` } : {}),
    useInMemoryStores: storesInMemory(),
  }
}