import {
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  PlusCircle,
  Scale,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../types'

/** Every clinical/operational role — patients get an explicit, smaller set below. */
export const ALL_ROLES: Role[] = ['nurse', 'doctor', 'admin', 'facility-admin', 'system-admin']

/** Roles allowed into the facility-management / admin-only sections. */
export const ADMIN_ROLES: Role[] = ['admin', 'facility-admin', 'system-admin']

/** The signed-in patient role: own records only. */
export const PATIENT_ROLES: Role[] = ['patient']

export const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient (self service)',
  nurse: 'Nurse / Health Worker',
  doctor: 'Doctor / Medical Officer',
  admin: 'Facility Administrator',
  'system-admin': 'System Administrator',
  'facility-admin': 'Facility Administrator',
}

/**
 * Single source of truth for navigation. Consumed by the desktop sidebar,
 * the mobile bottom bar and the mobile "More" sheet.
 */
export interface NavItem {
  id: string
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  /** Ordering inside the desktop sidebar rail. */
  order: number
  /** Which section of the desktop rail the item belongs to. */
  sidebar: 'primary' | 'overflow'
  /** Shown as one of the fixed slots in the mobile bottom bar. */
  bottom: boolean
  /** Rendered as the raised circular FAB in the middle of the bottom bar. */
  center?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', to: '/app', label: 'Dashboard', icon: LayoutDashboard, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 0, sidebar: 'primary', bottom: true },
  { id: 'triage', to: '/app/triage', label: 'Triage Queue', icon: ListTodo, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 1, sidebar: 'primary', bottom: false },
  { id: 'review', to: '/app/review', label: 'Reviewer', icon: ClipboardCheck, roles: ALL_ROLES, order: 2, sidebar: 'primary', bottom: false },
  { id: 'cases', to: '/app/cases', label: 'Patients', icon: Users, roles: ALL_ROLES, order: 3, sidebar: 'primary', bottom: true },
  { id: 'intake', to: '/app/new-intake', label: 'New Intake', icon: PlusCircle, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 4, sidebar: 'primary', bottom: true, center: true },
  { id: 'reports', to: '/app/reports', label: 'Reports', icon: FileText, roles: ALL_ROLES, order: 5, sidebar: 'primary', bottom: false },
  { id: 'referrals', to: '/app/referrals', label: 'Referrals', icon: ClipboardList, roles: ALL_ROLES, order: 6, sidebar: 'primary', bottom: false },
  { id: 'followups', to: '/app/followups', label: 'Follow-ups', icon: CalendarClock, roles: ALL_ROLES, order: 7, sidebar: 'primary', bottom: true },
  { id: 'camps', to: '/app/camps', label: 'Health Camps', icon: HeartPulse, roles: ALL_ROLES, order: 8, sidebar: 'overflow', bottom: false },
  { id: 'analytics', to: '/app/analytics', label: 'Analytics', icon: ScrollText, roles: ['admin', 'system-admin'], order: 9, sidebar: 'overflow', bottom: false },
  { id: 'audit', to: '/app/audit', label: 'Audit Logs', icon: ScrollText, roles: ADMIN_ROLES, order: 10, sidebar: 'overflow', bottom: false },
  { id: 'users', to: '/app/users', label: 'Users', icon: UserCog, roles: ADMIN_ROLES, order: 11, sidebar: 'overflow', bottom: false },
  { id: 'facilities', to: '/app/facilities', label: 'Facilities', icon: Building2, roles: ADMIN_ROLES, order: 12, sidebar: 'overflow', bottom: false },
  { id: 'settings', to: '/app/settings', label: 'Settings', icon: Settings, roles: ADMIN_ROLES, order: 13, sidebar: 'overflow', bottom: false },
  { id: 'security', to: '/app/security', label: 'Security', icon: Shield, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 14, sidebar: 'overflow', bottom: false },
  { id: 'model-card', to: '/app/model-card', label: 'Model Cards', icon: BookOpen, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 15, sidebar: 'overflow', bottom: false },
  { id: 'bias', to: '/app/bias', label: 'Bias Evaluation', icon: Scale, roles: ['admin', 'system-admin'], order: 16, sidebar: 'overflow', bottom: false },
  { id: 'feedback', to: '/app/feedback', label: 'Feedback', icon: MessagesSquare, roles: ALL_ROLES, order: 17, sidebar: 'overflow', bottom: false },
  { id: 'data-privacy', to: '/app/data-privacy', label: 'Data & Privacy', icon: ShieldCheck, roles: [...ALL_ROLES, ...PATIENT_ROLES], order: 18, sidebar: 'overflow', bottom: false },
]
