import type { ComponentType, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { matchPath, Navigate, useLocation } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import type { Role } from '../types'

import AnalyticsPage from '../pages/Analytics'
import AiTriagePage from '../pages/AiTriage'
import AppointmentDetailPage from '../pages/appointments/AppointmentDetailPage'
import AppointmentsPage from '../pages/appointments/AppointmentsPage'
import BookAppointmentPage from '../pages/appointments/BookAppointmentPage'
import AuditLogs from '../pages/AuditLogs'
import BiasPage from '../pages/Bias'
import CaseDetail from '../pages/CaseDetail'
import CasesPage from '../pages/Cases'
import Dashboard from '../pages/Dashboard'
import DataPrivacyPage from '../pages/DataPrivacy'
import FacilitiesPage from '../pages/Facilities'
import FeedbackPage from '../pages/Feedback'
import FollowupsPage from '../pages/Followups'
import HealthCamps from '../pages/HealthCamps'
import IntakeForm from '../components/intake/IntakeForm'
import ModelCardPage from '../pages/ModelCard'
import NotificationsPage from '../pages/Notifications'
import ReferralsPage from '../pages/Referrals'
import ReportsPage from '../pages/Reports'
import SecurityPage from '../pages/Security'
import SettingsPage from '../pages/Settings'
import TriageDashboard from '../components/dashboard/TriageDashboard'
import TriageQueue from '../pages/TriageQueue'
import UsersPage from '../pages/Users'

/** Every role with clinical/operational duties (excludes the patient role). */
export const CLINICAL_ROLES: Role[] = ['nurse', 'doctor', 'admin', 'facility-admin', 'system-admin']
/** Facility / system administration only. */
export const ADMIN_ROLES: Role[] = ['admin', 'facility-admin', 'system-admin']
/** Patient self-service plus all clinical roles. */
export const EVERYONE: Role[] = ['patient', ...CLINICAL_ROLES]

export interface AppRoute {
  /** Path relative to the `/app` parent. Empty string is the index route. */
  path: string
  /** Absolute href used by navigation. */
  to: string
  /** Document title + breadcrumb label. */
  title: string
  /** Sidebar / sheet label (may differ from the page heading). */
  label: string
  /** Roles allowed to open the route. Others are redirected with a toast. */
  roles: Role[]
  /** False for routes reachable only by deep-linking (case detail, aliases). */
  nav: boolean
  Component: ComponentType
}

/**
 * The single source of truth for the authenticated area. The sidebar, mobile
 * bar, command palette and role guards all read from this table.
 */
export const APP_ROUTES: AppRoute[] = [
  { path: '', to: '/app', title: 'Dashboard', label: 'Dashboard', roles: EVERYONE, nav: true, Component: Dashboard },
  { path: 'triage', to: '/app/triage', title: 'Triage Queue', label: 'Triage Queue', roles: CLINICAL_ROLES, nav: true, Component: TriageQueue },
  { path: 'review', to: '/app/review', title: 'Reviewer Workspace', label: 'Reviewer', roles: CLINICAL_ROLES, nav: true, Component: TriageDashboard },
  { path: 'ai-triage', to: '/app/ai-triage', title: 'AI Triage', label: 'AI Triage', roles: CLINICAL_ROLES, nav: true, Component: AiTriagePage },
  { path: 'cases', to: '/app/cases', title: 'Patients', label: 'Patients', roles: EVERYONE, nav: true, Component: CasesPage },
  { path: 'cases/:caseId', to: '/app/cases', title: 'Case Detail', label: 'Case detail', roles: EVERYONE, nav: false, Component: CaseDetail },
  { path: 'new-intake', to: '/app/new-intake', title: 'New Intake', label: 'New Intake', roles: EVERYONE, nav: true, Component: IntakeForm },
  { path: 'intake', to: '/app/new-intake', title: 'New Intake', label: 'New Intake', roles: EVERYONE, nav: false, Component: IntakeForm },
  { path: 'appointments', to: '/app/appointments', title: 'Appointments', label: 'Book Appointment', roles: EVERYONE, nav: true, Component: AppointmentsPage },
  { path: 'appointments/book', to: '/app/appointments/book', title: 'Book Appointment', label: 'Book Appointment', roles: EVERYONE, nav: false, Component: BookAppointmentPage },
  { path: 'appointments/:id', to: '/app/appointments', title: 'Appointment Detail', label: 'Appointment detail', roles: EVERYONE, nav: false, Component: AppointmentDetailPage },
  { path: 'reports', to: '/app/reports', title: 'Reports', label: 'Reports', roles: CLINICAL_ROLES, nav: true, Component: ReportsPage },
  { path: 'referrals', to: '/app/referrals', title: 'Referrals', label: 'Referrals', roles: CLINICAL_ROLES, nav: true, Component: ReferralsPage },
  { path: 'followups', to: '/app/followups', title: 'Follow-ups', label: 'Follow-ups', roles: EVERYONE, nav: true, Component: FollowupsPage },
  { path: 'camps', to: '/app/camps', title: 'Health Camps', label: 'Health Camps', roles: CLINICAL_ROLES, nav: true, Component: HealthCamps },
  { path: 'analytics', to: '/app/analytics', title: 'Analytics', label: 'Analytics', roles: ADMIN_ROLES, nav: true, Component: AnalyticsPage },
  { path: 'audit', to: '/app/audit', title: 'Audit Logs', label: 'Audit Logs', roles: ADMIN_ROLES, nav: true, Component: AuditLogs },
  { path: 'users', to: '/app/users', title: 'Users', label: 'Users', roles: ADMIN_ROLES, nav: true, Component: UsersPage },
  { path: 'facilities', to: '/app/facilities', title: 'Facilities', label: 'Facilities', roles: ADMIN_ROLES, nav: true, Component: FacilitiesPage },
  { path: 'settings', to: '/app/settings', title: 'Settings', label: 'Settings', roles: ADMIN_ROLES, nav: true, Component: SettingsPage },
  { path: 'security', to: '/app/security', title: 'Security', label: 'Security', roles: EVERYONE, nav: true, Component: SecurityPage },
  { path: 'model-card', to: '/app/model-card', title: 'Model Cards', label: 'Model Cards', roles: EVERYONE, nav: true, Component: ModelCardPage },
  { path: 'bias', to: '/app/bias', title: 'Bias Evaluation', label: 'Bias Evaluation', roles: ADMIN_ROLES, nav: true, Component: BiasPage },
  { path: 'feedback', to: '/app/feedback', title: 'Feedback', label: 'Feedback', roles: EVERYONE, nav: true, Component: FeedbackPage },
  { path: 'data-privacy', to: '/app/data-privacy', title: 'Data & Privacy', label: 'Data & Privacy', roles: EVERYONE, nav: true, Component: DataPrivacyPage },
  { path: 'notifications', to: '/app/notifications', title: 'Notifications', label: 'Notifications', roles: EVERYONE, nav: true, Component: NotificationsPage },
]

/** Nav-visible routes the role may use (drives the sidebar, bottom bar, More sheet). */
export function navRoutesForRole(role: Role): AppRoute[] {
  return APP_ROUTES.filter((r) => r.nav && r.roles.includes(role))
}

export function canAccess(role: Role, roles: Role[]): boolean {
  return roles.includes(role)
}

/** Longest-prefix match so `/app/cases/case-0001` resolves to the detail route. */
export function matchAppRoute(pathname: string): AppRoute | undefined {
  return APP_ROUTES.filter((r) => matchPath({ path: `/app/${r.path}`.replace(/\/$/, '') || '/app', end: true }, pathname))[0]
}

/**
 * Blocks a route the signed-in role may not use: shows a toast, then redirects
 * to the dashboard. The role comes from the server-issued session (AppStore).
 */
export function RouteGuard({ route, children }: { route: AppRoute; children: ReactNode }) {
  const { role, pushToast } = useApp()
  const allowed = canAccess(role, route.roles)
  const deniedRef = useRef(false)

  useEffect(() => {
    if (!allowed && !deniedRef.current) {
      deniedRef.current = true
      pushToast('warning', "You don't have access to that page.")
    }
  }, [allowed, pushToast])

  if (!allowed) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** Redirect helper used for the legacy `/app/intake` alias. */
export function Redirect({ to }: { to: string }) {
  return <Navigate to={to} replace />
}

/**
 * Sets `document.title` per route and moves focus to the page heading on every
 * hash navigation so keyboard/screen-reader users follow the route change.
 */
export function RouteMeta() {
  const location = useLocation()
  useEffect(() => {
    const route = matchAppRoute(location.pathname)
    document.title = route ? `${route.title} · SwasthyaFlow AI` : 'SwasthyaFlow AI'
    const main = document.getElementById('app-main')
    const heading = main?.querySelector('h1')
    const target = (heading as HTMLElement | null) ?? main
    target?.focus?.({ preventScroll: true })
  }, [location.pathname])
  return null
}
