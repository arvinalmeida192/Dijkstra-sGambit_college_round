import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AgreementPage } from './pages/AgreementPage'
import { DashboardPage } from './pages/DashboardPage'
import { DisputesPage } from './pages/DisputesPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NewProjectPage } from './pages/NewProjectPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { ProgressPage } from './pages/ProgressPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RegisterPage } from './pages/RegisterPage'
import { UiDemoPage } from './pages/UiDemoPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dev/ui" element={<UiDemoPage />} />

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<NewProjectPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route
            path="/projects/:projectId/agreement"
            element={<AgreementPage />}
          />
          <Route
            path="/projects/:projectId/progress"
            element={<ProgressPage />}
          />
          <Route
            path="/projects/:projectId/disputes"
            element={<DisputesPage />}
          />
          <Route
            path="/projects/:projectId/payments"
            element={<PaymentsPage />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
