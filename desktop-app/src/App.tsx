import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ThemeProvider } from './providers/ThemeProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoginPage } from './auth/LoginPage'
import { AppShell } from './layout/AppShell'

// Pages - Fáze 1/2/3/4/5
import { DashboardPage } from './pages/DashboardPage'
import { MlDashboardPage } from './pages/MlDashboardPage'
import { MlRunsPage } from './pages/MlRunsPage'
import { MlPredictionsPage } from './pages/MlPredictionsPage'
import { MlControlPage } from './pages/MlControlPage'
import { UsersPage } from './pages/UsersPage'
import { RolesPage } from './pages/RolesPage'
import { AuditTrailPage } from './pages/AuditTrailPage'
import { TrainingPage } from './pages/TrainingPage'
import { TrainingDataPage } from './pages/TrainingDataPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="ml/dashboard" element={<MlDashboardPage />} />
            <Route path="ml/runs" element={<MlRunsPage />} />
            <Route path="ml/predictions" element={<MlPredictionsPage />} />
            <Route path="ml/control" element={<MlControlPage />} />
            <Route path="ml/training-data" element={<TrainingDataPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit-trail" element={<AuditTrailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
