import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  applyConflict,
  applyStatus,
  buildQueuedItem,
  loadPersistedQueue,
  nextBatch,
  persistClear,
  persistDelete,
  persistQueueItem,
  queueFacilityId,
  type EnqueueInput,
} from '../services/offlineQueue'
import { ApiError, getActiveFacility } from '../services/api'
import { canEnqueueOfflineWrite } from '../services/rbacService'
import { isNetworkError, pushBatch } from '../services/syncService'
import type { ConflictResolution, QueuedItem } from '../types/sync.types'

interface OfflineContextValue {
  online: boolean
  /** True once the persisted queue has been read on boot. */
  booted: boolean
  syncing: boolean
  queue: QueuedItem[]
  pendingCount: number
  failedCount: number
  conflicts: QueuedItem[]
  lastSyncedAt: string | null
  /** Queue a write, returning the stored item. */
  enqueue: (input: Omit<EnqueueInput, 'actorId' | 'actorRole'> & { actorId?: string; actorRole?: EnqueueInput['actorRole'] }) => Promise<QueuedItem>
  /** Attempt to drain the queue now. */
  syncNow: () => Promise<void>
  /** Resolve a conflicted item by explicit human choice. */
  resolveConflict: (id: string, resolution: ConflictResolution, mergedPayload?: Record<string, unknown>) => Promise<void>
  /** Discard a single queued item. */
  removeItem: (id: string) => Promise<void>
  /** Drop every queued item (called on logout). */
  clearQueue: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

const MAX_ATTEMPTS = 5

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user, activeFacilityId } = useAuth()
  const online = useOnlineStatus()
  const [queue, setQueue] = useState<QueuedItem[]>([])
  const [booted, setBooted] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  // Refs keep the async sync loop from reading stale closures.
  const queueRef = useRef<QueuedItem[]>([])
  const syncingRef = useRef(false)
  queueRef.current = queue

  const replaceQueue = (next: QueuedItem[]) => {
    queueRef.current = next
    setQueue(next)
  }

  const persist = async (item: QueuedItem) => {
    await persistQueueItem(item)
    setQueue((prev) => {
      const next = prev.some((i) => i.id === item.id)
        ? prev.map((i) => (i.id === item.id ? item : i))
        : [...prev, item]
      queueRef.current = next
      return next
    })
  }

  const dropItem = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((i) => i.id !== id)
      queueRef.current = next
      return next
    })
  }

  // Load the persisted queue once on boot.
  useEffect(() => {
    let alive = true
    loadPersistedQueue().then((items) => {
      if (!alive) return
      replaceQueue(items)
      setBooted(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Switching facility must never replay another tenant's queued writes (P1-10).
  useEffect(() => {
    if (!booted || !activeFacilityId) return
    const queuedFacility = queueFacilityId(queueRef.current)
    if (queuedFacility && queuedFacility !== activeFacilityId) {
      void persistClear().then(() => replaceQueue([]))
    }
  }, [activeFacilityId, booted])

  const enqueue = async (
    input: Omit<EnqueueInput, 'actorId' | 'actorRole'> & { actorId?: string; actorRole?: EnqueueInput['actorRole'] },
  ): Promise<QueuedItem> => {
    const facilityId = input.facilityId ?? getActiveFacility() ?? activeFacilityId ?? undefined
    const queuedFacility = queueFacilityId(queueRef.current)
    if (queuedFacility && facilityId && queuedFacility !== facilityId) {
      throw new ApiError('Queued writes belong to another facility — sync or discard them first.', 409)
    }
    const item = buildQueuedItem({
      ...input,
      facilityId,
      actorId: input.actorId ?? user?.id ?? 'anonymous',
      actorRole: input.actorRole ?? user?.role ?? 'patient',
    })
    if (!canEnqueueOfflineWrite(item.actorRole, item.actionType)) {
      throw new ApiError(`Your role cannot queue ${item.actionType} offline.`, 403)
    }
    await persist(item)
    return item
  }

  const syncNow = async (): Promise<void> => {
    if (syncingRef.current || !online) return
    const batch = nextBatch(queueRef.current)
    if (batch.length === 0) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await pushBatch(batch)
      const byId = new Map(batch.map((i) => [i.id, i]))
      for (const outcome of result.results) {
        const item = byId.get(outcome.id) ?? queueRef.current.find((i) => i.id === outcome.id)
        if (!item) continue
        if (outcome.status === 'synced') {
          await persistQueueItem({ ...item, status: 'synced' })
          await persistDelete(outcome.id)
          dropItem(outcome.id)
        } else if (outcome.status === 'conflict' && outcome.conflict) {
          await persist(applyConflict(item, outcome.conflict))
        } else {
          await persist(applyStatus(item, 'failed', outcome.error ?? 'Sync failed'))
        }
      }
      setLastSyncedAt(new Date().toISOString())
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Session gone — stop; the auth-expired handler will clear the queue.
      } else if (isNetworkError(e)) {
        // Still offline — leave items pending for the next pass.
      }
      // Other HTTP errors (e.g. 400 for the whole batch) leave items pending too.
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }

  // Auto-drain: when back online, on the online event, and after each change.
  useEffect(() => {
    if (!booted || !online || syncing) return
    const hasWork = queue.some(
      (i) => (i.status === 'pending' || i.status === 'failed') && i.attemptCount < MAX_ATTEMPTS,
    )
    if (!hasWork) return
    const timer = setTimeout(() => void syncNow(), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, booted, queue, syncing])

  const resolveConflict = async (
    id: string,
    resolution: ConflictResolution,
    mergedPayload?: Record<string, unknown>,
  ): Promise<void> => {
    const item = queueRef.current.find((i) => i.id === id)
    if (!item) return
    if (resolution === 'keep-server') {
      await persistDelete(id)
      dropItem(id)
      return
    }
    if (resolution === 'abandon') {
      await persist({ ...item, status: 'abandoned', conflictInfo: null, lastError: 'Abandoned after conflict.' })
      await persistDelete(id)
      dropItem(id)
      return
    }
    // keep-mine: re-arm the item against the server's current version.
    const baseUpdatedAt = item.conflictInfo?.serverVersion ?? item.payload.baseUpdatedAt
    const payload: Record<string, unknown> = mergedPayload ? { ...mergedPayload } : { ...item.payload }
    if (baseUpdatedAt) payload.baseUpdatedAt = baseUpdatedAt
    await persist({
      ...item,
      payload,
      status: 'pending',
      conflictInfo: null,
      lastError: null,
      attemptCount: 0,
    })
    if (online) void syncNow()
  }

  const removeItem = async (id: string): Promise<void> => {
    await persistDelete(id)
    dropItem(id)
  }

  const clearQueue = async (): Promise<void> => {
    await persistClear()
    replaceQueue([])
  }

  // A revoked/expired session must never leak another user's queued writes.
  useEffect(() => {
    const handler = () => {
      void clearQueue()
    }
    if (typeof window === 'undefined') return
    window.addEventListener('swasthyaflow:auth-expired', handler)
    return () => window.removeEventListener('swasthyaflow:auth-expired', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Signing out also clears the queue (a different user must not inherit it).
  const prevUserId = useRef<string | null>(null)
  useEffect(() => {
    if (prevUserId.current && !user) void clearQueue()
    prevUserId.current = user?.id ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const conflicts = queue.filter((i) => i.status === 'conflict')
  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'in-flight').length
  const failedCount = queue.filter((i) => i.status === 'failed').length

  const value: OfflineContextValue = {
    online,
    booted,
    syncing,
    queue,
    pendingCount,
    failedCount,
    conflicts,
    lastSyncedAt,
    enqueue,
    syncNow,
    resolveConflict,
    removeItem,
    clearQueue,
  }

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline must be used within an OfflineProvider')
  return ctx
}
