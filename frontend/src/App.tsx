import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout, ToastStack } from './components/layout'
import AnalyticsPage from './pages/Analytics'
import AuditLogs from './pages/AuditLogs'
import BiasPage from './pages/Bias'
import CaseDetail from './pages/CaseDetail'
import CasesPage from './pages/Cases'
import FacilitiesPage from './pages/Facilities'
import Dashboard from './pages/Dashboard'
import DataPrivacyPage from './pages/DataPrivacy'
import FeedbackPage from './pages/Feedback'
import FollowupsPage from './pages/Followups'
import HealthCamps from './pages/HealthCamps'
import LandingPage from './pages/Landing'
import NewIntake from './pages/Intake'
import LoginPage from './pages/Login'
import NewIntakePage from './pages/NewIntake'
import ModelCardPage from './pages/ModelCard'
import ReferralsPage from './pages/Referrals'
import ReportsPage from './pages/Reports'
import ReviewPage from './pages/Review'
import SecurityPage from './pages/Security'
import SettingsPage from './pages/Settings'
import TriageQueue from './pages/TriageQueue'
import UsersPage from './pages/Users'
import { AppProvider, useApp } from './store/AppStore'
import type { Role } from './types'
import { EASE } from './components/ui'
import { TriageProvider } from './context/TriageContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OfflineProvider, useOffline } from './context/OfflineContext'
import { OfflineBanner } from './components/offline/OfflineBanner'
import { SyncStatusIndicator } from './components/offline/SyncStatusIndicator'
import { SyncQueuePanel } from './components/offline/SyncQueuePanel'

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role } = useApp()
  if (role !== 'admin' && role !== 'system-admin' && role !== 'facility-admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6">
        <p className="text-sm font-semibold text-amber-800">Admin access required</p>
        <p className="mt-1 text-xs text-amber-700">
          This page is restricted to the Facility Administrator role. Sign in with an admin account to
          open it.
        </p>
      </div>
    )
  }
  return <>{children}</>
}

/** Blocks the whole app until a valid session exists (redirects to /login). */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, checking } = useAuth()
  const location = useLocation()

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
        <p className="text-[12px] font-semibold text-ink-400">Restoring your session…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        <Routes location={location}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/triage" element={<TriageQueue />} />
          <Route path="/app/cases" element={<CasesPage />} />
          <Route path="/app/cases/:caseId" element={<CaseDetail />} />
          <Route path="/app/intake" element={<NewIntake />} />
          <Route path="/app/new-intake" element={<NewIntakePage />} />
          <Route path="/app/review" element={<ReviewPage />} />
          <Route path="/app/reports" element={<ReportsPage />} />
          <Route path="/app/referrals" element={<ReferralsPage />} />
          <Route path="/app/camps" element={<HealthCamps />} />
          <Route path="/app/followups" element={<FollowupsPage />} />
          <Route path="/app/analytics" element={<AdminOnly><AnalyticsPage /></AdminOnly>} />
          <Route path="/app/audit" element={<AdminOnly><AuditLogs /></AdminOnly>} />
          <Route path="/app/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
          <Route path="/app/model-card" element={<ModelCardPage />} />
            <Route path="/app/bias" element={<AdminOnly><BiasPage /></AdminOnly>} />
            <Route path="/app/feedback" element={<FeedbackPage />} />
          <Route path="/app/security" element={<SecurityPage />} />
          <Route path="/app/data-privacy" element={<DataPrivacyPage />} />
          <Route path="/app/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
          <Route path="/app/facilities" element={<AdminOnly><FacilitiesPage /></AdminOnly>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

/** Banner + header chip + queue panel, shared for the whole authenticated app. */
function OfflineShell({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { online, booted } = useOffline()
  // Keep the chip mounted only once the queue has loaded, avoiding an early flash.
  const showChip = booted || !online
  return (
    <>
      <OfflineBanner />
      <div className="fixed right-3 top-3 z-30">{showChip && <SyncStatusIndicator onOpen={() => setPanelOpen(true)} />}</div>
      {children}
      <SyncQueuePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AuthProvider>
          <OfflineProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/app/*"
                element={
                  <RequireAuth>
                    <TriageProvider>
                      <OfflineShell>
                        <AppLayout>
                          <AnimatedRoutes />
                        </AppLayout>
                        <ToastStack />
                      </OfflineShell>
                    </TriageProvider>
                  </RequireAuth>
                }
              />
            </Routes>
          </OfflineProvider>
        </AuthProvider>
      </HashRouter>
    </AppProvider>
  )
}

export type { Role }
