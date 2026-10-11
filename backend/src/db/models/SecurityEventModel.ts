import mongoose, { Schema } from 'mongoose'

/**
 * Security events (P1-12). Details are pre-anonymised before storage. Raw IP is
 * permitted here (and only here) so abuse can be investigated and blocked;
 * user agents are recorded only when operationally required. Rows expire after
 * 365 days via a TTL index.
 */
export interface DbSecurityEvent {
  _id: string
  eventId: string
  type: string
  actorId?: string | null
  actorRole?: string | null
  facilityId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail: string
  requestId?: string | null
  createdAt: Date
}

const SecurityEventSchema = new Schema<DbSecurityEvent>(
  {
    _id: { type: String, required: true },
    eventId: { type: String, required: true, index: true, unique: true },
    type: { type: String, required: true, index: true },
    actorId: { type: String, required: false, index: true, default: null },
    actorRole: { type: String, required: false, default: null },
    facilityId: { type: String, required: false, index: true, default: null },
    ip: { type: String, required: false, default: null },
    userAgent: { type: String, required: false, default: null },
    detail: { type: String, required: true },
    requestId: { type: String, required: false, default: null },
    createdAt: { type: Date, required: true, index: { expireAfterSeconds: 60 * 60 * 24 * 365 } },
  },
  { versionKey: false, _id: false },
)

export const SecurityEventModel = mongoose.model<DbSecurityEvent>(
  'SecurityEvent',
  SecurityEventSchema,
  'security_events',
)
