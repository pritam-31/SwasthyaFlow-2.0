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
import { hydrateFacilities, seedDefaultFacility, seedDemoFacilities } from '../services/facilityService'
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
import { hydrateDepartments, listDepartmentsForFacility, seedDefaultDepartments } from '../services/departmentService'
import { ensureDoctorForUser, hydrateAvailability, hydrateDoctors, listAvailability, listDoctorsForFacility, seedAvailabilityForDoctor, seedDoctorDirectory, todayDate, addDays } from '../services/doctorService'
import { hydrateAppointments as hydrateAppointmentStore, seedDemoBooking } from '../services/appointmentService'
import { hydrateAppointmentNotifications } from '../services/notificationService'
import { DEFAULT_FACILITY_ID } from '../types/facility.types'
import type { AppointmentStatus, BookingMode } from '../types/appointment.types'

/**
 * Boot/shutdown orchestration for the persistence layer (P1-9).
 *
 * In-memory (default): seeds the demo dataset into the process maps exactly as
 * before. Persistent: connects to Mongo, rehydrates every store from disk, then
 * seeds the demo dataset once (guarded by a SeedMarker version).
 */

export const SEED_VERSION = '2026-10-p1-12'

function seedOwner(): SeedOwner {
  const owner = listUsers().find((u) => u.role === 'nurse') ?? listUsers()[0]
  return { id: owner.id, displayName: owner.displayName }
}

/** Seeds a department directory, the demo doctor profile + schedule, and a few
 *  synthetic appointments so every appointment screen has realistic data. */
export function seedAppointmentDemoData(): void {
  const facilityId = DEFAULT_FACILITY_ID
  seedDefaultDepartments()
  const departments = listDepartmentsForFacility(facilityId)
  const general = departments.find((d) => d.name.toLowerCase().includes('general')) ?? departments[0]
  if (!general) return
  const doctorUser = listUsers().find((u) => u.username === 'doctor')
  const patientUser = listUsers().find((u) => u.username === 'patient')
  const doctor = ensureDoctorForUser(doctorUser?.id, facilityId, {
    departmentId: general.id,
    name: doctorUser?.displayName ?? 'Dr. A. Mehta',
    specialization: 'General Medicine',
    qualifications: ['MBBS', 'MD (General Medicine)'],
    experienceYears: 12,
    consultationType: 'general',
  })
  seedDoctorDirectory(departments, facilityId)
  for (const seedDoc of listDoctorsForFacility(facilityId)) {
    if (listAvailability(seedDoc.id).length === 0) seedAvailabilityForDoctor(seedDoc.id, facilityId)
  }
  if (!patientUser) return
  const today = todayDate()
  const samples: Array<{ date: string; time: string; status: AppointmentStatus; mode: BookingMode; reason: string }> = [
    { date: addDays(today, -5), time: '09:30', status: 'completed', mode: 'direct', reason: 'Routine blood-pressure follow-up.' },
    { date: addDays(today, -3), time: '14:00', status: 'completed', mode: 'direct', reason: 'Persistent headache.' },
    { date: addDays(today, -2), time: '11:00', status: 'cancelled', mode: 'direct', reason: 'Lab report review.' },
    { date: addDays(today, 1), time: '09:15', status: 'confirmed', mode: 'direct', reason: 'Quarterly wellness check.' },
    { date: addDays(today, 2), time: '10:30', status: 'pending', mode: 'triage', reason: 'Follow-up from triage assessment.' },
    { date: addDays(today, 4), time: '12:30', status: 'pending', mode: 'direct', reason: 'Skin rash concerns.' },
  ]
  for (const sample of samples) {
    try {
      seedDemoBooking({
        patientId: patientUser.id,
        patientName: patientUser.displayName,
        doctorId: doctor.id,
        appointmentDate: sample.date,
        startTime: sample.time,
        visitReason: sample.reason,
        status: sample.status,
        bookingMode: sample.mode,
      })
    } catch {
      // Skip if a sample slot collides — the remainder still seeds.
    }
  }
}

export async function seedDemoData(): Promise<void> {
  seedDefaultFacility()
  seedDemoFacilities()
  seedUsers()
  seedSessions(seedOwner())
  seedDefaultSlaConfigs()
  seedAppointmentDemoData()
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
  await hydrateDepartments()
  await hydrateDoctors()
  await hydrateAvailability()
  await hydrateAppointmentStore()
  await hydrateAppointmentNotifications()

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
