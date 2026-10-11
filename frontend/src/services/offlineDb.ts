/**
 * IndexedDB persistence for the offline write queue and the read cache (P1-8).
 *
 * Deliberately dependency-free (no `idb` package): a thin promise wrapper over
 * the native IndexedDB API. When IndexedDB is unavailable (SSR, locked-down
 * browsers, the Node build/lint step) every helper falls back to an in-memory
 * Map so the app still boots — it simply loses durability.
 *
 * Privacy: this module only ever stores already-anonymised payloads and cached
 * server views. Raw PII and file bytes are never written here (they never reach
 * the queue or the cache in the first place).
 */

import type { QueuedItem } from '../types/sync.types'

const DB_NAME = 'swasthyaflow-offline'
const DB_VERSION = 1
const STORE_QUEUE = 'queue'
const STORE_CACHE = 'cache'
const STORE_META = 'meta'

interface CacheRecord {
  key: string
  value: unknown
  cachedAt: string
}

interface MetaRecord {
  key: string
  value: unknown
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Environment detection                                              */
/* ------------------------------------------------------------------ */

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  In-memory fallback                                                 */
/* ------------------------------------------------------------------ */

const memoryQueue = new Map<string, QueuedItem>()
const memoryCache = new Map<string, CacheRecord>()
const memoryMeta = new Map<string, MetaRecord>()

/* ------------------------------------------------------------------ */
/*  Native IndexedDB helpers                                           */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('sessionId', 'sessionId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open the offline database.'))
  })
  return dbPromise
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const req = fn(tx.objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Offline database operation failed.'))
      }),
  )
}

/* ------------------------------------------------------------------ */
/*  Queue store                                                        */
/* ------------------------------------------------------------------ */

export async function loadQueue(): Promise<QueuedItem[]> {
  if (!isIndexedDbAvailable()) return [...memoryQueue.values()]
  try {
    const rows = await withStore<QueuedItem[]>(STORE_QUEUE, 'readonly', (s) => s.getAll() as IDBRequest<QueuedItem[]>)
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

export async function saveQueueItem(item: QueuedItem): Promise<void> {
  if (!isIndexedDbAvailable()) {
    memoryQueue.set(item.id, item)
    return
  }
  try {
    await withStore(STORE_QUEUE, 'readwrite', (s) => s.put(item))
  } catch {
    memoryQueue.set(item.id, item)
  }
}

export async function deleteQueueItem(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) {
    memoryQueue.delete(id)
    return
  }
  try {
    await withStore(STORE_QUEUE, 'readwrite', (s) => s.delete(id))
  } catch {
    memoryQueue.delete(id)
  }
}

export async function clearQueueStore(): Promise<void> {
  memoryQueue.clear()
  if (!isIndexedDbAvailable()) return
  try {
    await withStore(STORE_QUEUE, 'readwrite', (s) => s.clear())
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ */
/*  Read cache                                                         */
/* ------------------------------------------------------------------ */

export async function cacheGet<T>(key: string): Promise<{ value: T; cachedAt: string } | null> {
  if (!isIndexedDbAvailable()) {
    const row = memoryCache.get(key)
    return row ? { value: row.value as T, cachedAt: row.cachedAt } : null
  }
  try {
    const row = await withStore<CacheRecord | undefined>(STORE_CACHE, 'readonly', (s) => s.get(key) as IDBRequest<CacheRecord | undefined>)
    return row ? { value: row.value as T, cachedAt: row.cachedAt } : null
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const record: CacheRecord = { key, value, cachedAt: new Date().toISOString() }
  if (!isIndexedDbAvailable()) {
    memoryCache.set(key, record)
    return
  }
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.put(record))
  } catch {
    memoryCache.set(key, record)
  }
}

export async function cacheDelete(key: string): Promise<void> {
  memoryCache.delete(key)
  if (!isIndexedDbAvailable()) return
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.delete(key))
  } catch {
    /* best effort */
  }
}

export async function clearCacheStore(): Promise<void> {
  memoryCache.clear()
  if (!isIndexedDbAvailable()) return
  try {
    await withStore(STORE_CACHE, 'readwrite', (s) => s.clear())
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ */
/*  Meta store (server version, last sync time)                        */
/* ------------------------------------------------------------------ */

export async function metaGet<T>(key: string): Promise<T | null> {
  if (!isIndexedDbAvailable()) return (memoryMeta.get(key)?.value as T) ?? null
  try {
    const row = await withStore<MetaRecord | undefined>(STORE_META, 'readonly', (s) => s.get(key) as IDBRequest<MetaRecord | undefined>)
    return row ? (row.value as T) : null
  } catch {
    return null
  }
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  const record: MetaRecord = { key, value, updatedAt: new Date().toISOString() }
  if (!isIndexedDbAvailable()) {
    memoryMeta.set(key, record)
    return
  }
  try {
    await withStore(STORE_META, 'readwrite', (s) => s.put(record))
  } catch {
    memoryMeta.set(key, record)
  }
}
