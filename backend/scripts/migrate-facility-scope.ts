import 'dotenv/config'
import { connectMongo, disconnectMongo, mongoUri } from '../src/db/mongoose'
import { FacilityModel } from '../src/db/models/FacilityModel'
import { UserModel } from '../src/db/models/User'
import { LoginSessionModel } from '../src/db/models/LoginSession'
import { PatientSessionModel } from '../src/db/models/PatientSession'
import { TriageNoteModel } from '../src/db/models/TriageNote'
import { ExtractedReportModel } from '../src/db/models/ExtractedReport'
import { ExtractedVisualModel } from '../src/db/models/ExtractedVisual'
import { AuditEntryModel } from '../src/db/models/AuditEntry'
import { TimelineModel } from '../src/db/models/Timeline'
import { FollowUpQuestionModel } from '../src/db/models/FollowUpQuestion'
import { ReferralModel } from '../src/db/models/Referral'
import { ConsentRecordModel } from '../src/db/models/ConsentRecord'
import { RetentionRuleModel } from '../src/db/models/RetentionRule'
import { RetentionActionModel } from '../src/db/models/RetentionAction'
import { TombstoneModel } from '../src/db/models/Tombstone'
import { AnonymisationReportModel } from '../src/db/models/AnonymisationReport'
import { ReviewerFeedbackModel } from '../src/db/models/ReviewerFeedback'
import { CloudinaryAssetModel } from '../src/db/models/CloudinaryAsset'
import { IdempotencyKeyModel } from '../src/db/models/IdempotencyKeyModel'
import { setSeedMarker } from '../src/repositories/seedRepository'
import { DEFAULT_FACILITY_ID, DEFAULT_FACILITY_NAME } from '../src/types/facility.types'

/**
 * Backfills `facilityId` on every scoped collection to the default facility and
 * ensures the default facility row exists (P1-10). Idempotent — documents that
 * already carry a facilityId are left untouched, so single-facility deployments
 * upgrade in place without losing data.
 */
process.env.USE_IN_MEMORY_STORES = 'false'

const MIGRATION_MARKER = 'facility-migration-v1'

interface Backfillable {
  collection: {
    collectionName: string
    updateMany(filter: object, update: object): Promise<{ modifiedCount: number }>
  }
}

const SCOPED_MODELS: Backfillable[] = [
  UserModel,
  LoginSessionModel,
  PatientSessionModel,
  TriageNoteModel,
  ExtractedReportModel,
  ExtractedVisualModel,
  AuditEntryModel,
  TimelineModel,
  FollowUpQuestionModel,
  ReferralModel,
  ConsentRecordModel,
  RetentionRuleModel,
  RetentionActionModel,
  TombstoneModel,
  AnonymisationReportModel,
  ReviewerFeedbackModel,
  CloudinaryAssetModel,
  IdempotencyKeyModel,
]

async function run(): Promise<void> {
  await connectMongo()
  console.log(`[db:migrate-facility] connected to ${mongoUri()}`)

  const stamp = new Date().toISOString()
  await FacilityModel.updateOne(
    { _id: DEFAULT_FACILITY_ID },
    {
      $setOnInsert: {
        _id: DEFAULT_FACILITY_ID,
        id: DEFAULT_FACILITY_ID,
        name: DEFAULT_FACILITY_NAME,
        type: 'phc',
        status: 'active',
        region: null,
        district: null,
        state: null,
        contactRef: null,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: 'system',
        updatedBy: 'system',
      },
    },
    { upsert: true },
  )
  console.log(`[db:migrate-facility] default facility ensured (${DEFAULT_FACILITY_ID})`)

  const filter = { $or: [{ facilityId: { $exists: false } }, { facilityId: null }] }
  for (const model of SCOPED_MODELS) {
    const result = await model.collection.updateMany(filter, { $set: { facilityId: DEFAULT_FACILITY_ID } })
    console.log(
      `[db:migrate-facility] ${model.collection.collectionName}: ${result.modifiedCount} document(s) backfilled`,
    )
  }

  await AuditEntryModel.updateOne(
    { _id: 'aud-facility-migration' },
    {
      $set: {
        _id: 'aud-facility-migration',
        id: 'aud-facility-migration',
        sessionId: 'db',
        facilityId: DEFAULT_FACILITY_ID,
        actor: 'system',
        role: 'system-admin',
        action: 'db.facility-migration-applied',
        detail: 'Facility scoping backfill applied to all collections.',
        category: 'system',
        at: stamp,
      },
    },
    { upsert: true },
  )
  await setSeedMarker(MIGRATION_MARKER, stamp)

  console.log('[db:migrate-facility] done')
  await disconnectMongo()
}

run().catch((err) => {
  console.error('[db:migrate-facility] failed:', err)
  process.exit(1)
})
