import {
  Bell,
  BookOpen,
  BrainCircuit,
  Building2,
  CalendarClock,
  CalendarDays,
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
import { APP_ROUTES } from '../app/routes'
import type { Role } from '../types'

/** Every clinical/operational role — patients get an explicit, smaller set. */
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
 * the mobile bottom bar and the mobile "More" sheet. Labels, roles and paths
 * come from the shared route table so nav and guards can never drift apart.
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

interface NavMeta {
  id: string
  icon: LucideIcon
  order: number
  sidebar: 'primary' | 'overflow'
  bottom: boolean
  center?: boolean
}

/** Presentation-only metadata keyed by absolute route. */
const NAV_META: Record<string, NavMeta> = {
  '/app': { id: 'dashboard', icon: LayoutDashboard, order: 0, sidebar: 'primary', bottom: true },
  '/app/triage': { id: 'triage', icon: ListTodo, order: 1, sidebar: 'primary', bottom: false },
  '/app/review': { id: 'review', icon: ClipboardCheck, order: 2, sidebar: 'primary', bottom: false },
  '/app/ai-triage': { id: 'ai-triage', icon: BrainCircuit, order: 2.5, sidebar: 'primary', bottom: false },
  '/app/cases': { id: 'cases', icon: Users, order: 3, sidebar: 'primary', bottom: true },
  '/app/new-intake': { id: 'intake', icon: PlusCircle, order: 4, sidebar: 'primary', bottom: true, center: true },
  '/app/reports': { id: 'reports', icon: FileText, order: 5, sidebar: 'primary', bottom: false },
  '/app/referrals': { id: 'referrals', icon: ClipboardList, order: 6, sidebar: 'primary', bottom: false },
  '/app/followups': { id: 'followups', icon: CalendarClock, order: 7, sidebar: 'primary', bottom: true },
  '/app/appointments': { id: 'appointments', icon: CalendarDays, order: 8, sidebar: 'primary', bottom: false },
  '/app/notifications': { id: 'notifications', icon: Bell, order: 9, sidebar: 'overflow', bottom: false },
  '/app/camps': { id: 'camps', icon: HeartPulse, order: 10, sidebar: 'overflow', bottom: false },
  '/app/analytics': { id: 'analytics', icon: ScrollText, order: 11, sidebar: 'overflow', bottom: false },
  '/app/audit': { id: 'audit', icon: ScrollText, order: 12, sidebar: 'overflow', bottom: false },
  '/app/users': { id: 'users', icon: UserCog, order: 13, sidebar: 'overflow', bottom: false },
  '/app/facilities': { id: 'facilities', icon: Building2, order: 14, sidebar: 'overflow', bottom: false },
  '/app/settings': { id: 'settings', icon: Settings, order: 15, sidebar: 'overflow', bottom: false },
  '/app/security': { id: 'security', icon: Shield, order: 16, sidebar: 'overflow', bottom: false },
  '/app/model-card': { id: 'model-card', icon: BookOpen, order: 17, sidebar: 'overflow', bottom: false },
  '/app/bias': { id: 'bias', icon: Scale, order: 18, sidebar: 'overflow', bottom: false },
  '/app/feedback': { id: 'feedback', icon: MessagesSquare, order: 19, sidebar: 'overflow', bottom: false },
  '/app/data-privacy': { id: 'data-privacy', icon: ShieldCheck, order: 20, sidebar: 'overflow', bottom: false },
}

export const NAV_ITEMS: NavItem[] = APP_ROUTES.filter((r) => r.nav && NAV_META[r.to]).map((r) => {
  const meta = NAV_META[r.to]
  return {
    id: meta.id,
    to: r.to,
    label: r.label,
    icon: meta.icon,
    roles: r.roles,
    order: meta.order,
    sidebar: meta.sidebar,
    bottom: meta.bottom,
    center: meta.center,
  }
})
