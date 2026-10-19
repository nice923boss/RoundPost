import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell.tsx'
import StatusDashboard from './components/dashboard/StatusDashboard.tsx'
import CalendarView from './components/calendar/CalendarView.tsx'
import PlatformManager from './components/platforms/PlatformManager.tsx'
import TemplateManager from './components/templates/TemplateManager.tsx'
import SearchPanel from './components/search/SearchPanel.tsx'
import SettingsPage from './components/settings/SettingsPage.tsx'
import ConfirmDialog from './components/common/ConfirmDialog.tsx'
import ToastHost from './components/common/ToastHost.tsx'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<StatusDashboard />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="platforms" element={<PlatformManager />} />
          <Route path="templates" element={<TemplateManager />} />
          <Route path="search" element={<SearchPanel />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <ConfirmDialog />
      <ToastHost />
    </>
  )
}
