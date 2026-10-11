import { connectMongo, disconnectMongo, persistenceEnabled, seedOnBoot } from './mongoose'
import { drainWrites } from '../repositories/writeQueue'
import { getSeedMarker, setSeedMarker } from '../repositories/seedRepository'
import { hydrateAuth, listUsers, seedUsers } from '../services/authStore'
import { hydrateSessions, seedSessions, type SeedOwner } from '../services/sessionStore'
import { hydrateConsent } from '../services/consentRetentionService'
import { hydrateAudit } from '../services/auditStore'
import { hydrateTombstones } from '../services/tombstoneStore'
import { hydrateImages } from '../services/imageStore'
import { hydrateRetention } from '../services/retentionService'
import { hydrateAnonymisationReports } from '../services/anonymisationReportService'
import { hydrateReviewerFeedback } from '../services/reviewerFeedbackService'
import { hydrateFacilities, seedDefaultFacility } from '../services/facilityService'
import { hydratePriorityOverrides } from '../services/priorityOverrideService'
import { hydrateSlaConfigs, seedDefaultSlaConfigs } from '../services/slaService'
import { hydrateSecurityPolicies, seedGlobalSecurityPolicy } from '../services/passwordPolicyService'
import { hydrateConfidencePolicies, seedGlobalConfidencePolicy } from '../services/confidencePolicyService'
import { hydrateLowConfidenceReviewActions } from '../services/lowConfidenceService'
import { hydrateFeedback } from '../services/feedbackService'
import { hydrateSecurityEvents } from '../services/securityEventService'
import { hydrateRefreshTokens } from '../services/refreshTokenService'
import { hydrateDevices } from '../services/deviceService'
import { hydrateIpBlocklist } from '../services/ipBlocklistService'
import { hydrateModelCards, seedDefaultCards } from '../services/modelCardService'
import { hydrateFailureModes, seedDefaultFailureModes } from '../services/failureModeService'
import { hydrateBias } from '../services/biasReportService'
import { listRefreshTokens } from '../repositories/securityRepository'

/**
 * Boot/shutdown orchestration for the persistence layer (P1-9).
 *
 * In-memory (default): seeds the demo dataset into the process maps exactly as
 * before. Persistent: connects to Mongo, rehydrates every store from disk, then
 * seeds the demo dataset once (guarded by a SeedMarker version).
 */

export const SEED_VERSION = '2026-10-p1-11'

function seedOwner(): SeedOwner {
  const owner = listUsers().find((u) => u.role === 'nurse') ?? listUsers()[0]
  return { id: owner.id, displayName: owner.displayName }
}

async function seedDemoData(): Promise<void> {
  seedDefaultFacility()
  seedUsers()
  seedSessions(seedOwner())
  seedDefaultSlaConfigs()
}

export async function initPersistence(): Promise<void> {
  if (!persistenceEnabled()) {
    await seedDemoData()
    await seedGlobalSecurityPolicy()
    await seedGlobalConfidencePolicy()
    seedDefaultCards()
    seedDefaultFailureModes()
    await hydrateConsent()
    return
  }

  await connectMongo()
  await hydrateFacilities()
  await hydrateAuth()
  await hydrateSessions()
  await hydrateConsent()
  await hydrateAudit()
  await hydrateTombstones()
  await hydrateRetention()
  await hydrateAnonymisationReports()
  await hydrateReviewerFeedback()
  await hydrateSlaConfigs()
  await hydratePriorityOverrides()
  await hydrateSecurityPolicies()
  await hydrateSecurityEvents()
  await hydrateRefreshTokens(await listRefreshTokens())
  await hydrateDevices()
  await hydrateIpBlocklist()
  await hydrateModelCards()
  await hydrateFailureModes()
  await hydrateBias()
  await hydrateConfidencePolicies()
  await hydrateLowConfidenceReviewActions()
  await hydrateFeedback()

  if (seedOnBoot()) {
    const stamped = await getSeedMarker('demo')
    if (stamped !== SEED_VERSION) {
      await seedDemoData()
      await setSeedMarker('demo', SEED_VERSION)
    }
  }

  await seedGlobalSecurityPolicy()
  await seedGlobalConfidencePolicy()
  seedDefaultCards()
  seedDefaultFailureModes()
  await hydrateImages()
}

export async function shutdownPersistence(): Promise<void> {
  if (!persistenceEnabled()) return
  await drainWrites()
  await disconnectMongo()
}
