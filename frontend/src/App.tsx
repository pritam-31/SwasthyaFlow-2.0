import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout, ToastStack } from './components/layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import LandingPage from './pages/Landing'
import LoginPage from './pages/Login'
import NotFound from './pages/NotFound'
import { APP_ROUTES, RouteGuard } from './app/routes'
import { AppProvider } from './store/AppStore'
import type { Role } from './types'
import { TriageProvider } from './context/TriageContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OfflineProvider } from './context/OfflineContext'
import { OfflineBanner } from './components/offline/OfflineBanner'

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

/** Connectivity banner rendered above the authenticated shell. */
function OfflineShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      {children}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <AuthProvider>
            <OfflineProvider>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/app"
                  element={
                    <RequireAuth>
                      <TriageProvider>
                        <OfflineShell>
                          <AppLayout />
                          <ToastStack />
                        </OfflineShell>
                      </TriageProvider>
                    </RequireAuth>
                  }
                >
                  {APP_ROUTES.map((route) =>
                    route.path === '' ? (
                      <Route
                        key="app-index"
                        index
                        element={
                          <RouteGuard route={route}>
                            <route.Component />
                          </RouteGuard>
                        }
                      />
                    ) : (
                      <Route
                        key={route.path}
                        path={route.path}
                        element={
                          <RouteGuard route={route}>
                            <route.Component />
                          </RouteGuard>
                        }
                      />
                    ),
                  )}
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </OfflineProvider>
          </AuthProvider>
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}

export type { Role }
