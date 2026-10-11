import 'dotenv/config'
import mongoose from 'mongoose'

/**
 * MongoDB connection lifecycle (P1-9).
 *
 * The application boots in-memory unless `USE_IN_MEMORY_STORES=false` — that
 * keeps the existing prototype (and every test) working without a database,
 * while the persistent deployment routes the same store module surfaces
 * through Mongo-backed repositories (see src/repositories).
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

/** `false` routes through MongoDB + Cloudinary; anything else is in-memory. */
export function storesInMemory(): boolean {
  return process.env.USE_IN_MEMORY_STORES !== 'false'
}

/** True when the in-memory stores should mirror their writes to Mongo. */
export function persistenceEnabled(): boolean {
  return !storesInMemory()
}

export function mongoUri(): string {
  return process.env.MONGODB_URI ?? 'mongodb://localhost:27017/swasthyaflow'
}

export function seedOnBoot(): boolean {
  return process.env.SEED_ON_BOOT !== 'false'
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1
}

export async function connectMongo(uri: string = mongoUri()): Promise<typeof mongoose> {
  if (connected) return mongoose
  if (connecting) return connecting
  mongoose.set('strictQuery', true)
  connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: process.env.NODE_ENV !== 'production',
  })
  try {
    await connecting
    connected = true
  } finally {
    connecting = null
  }
  return mongoose
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