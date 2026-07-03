import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { AlertPage } from './pages/AlertPage';
import { CalendarPage } from './pages/CalendarPage';
import { HelpPage } from './pages/HelpPage';
import { SettingsPage } from './pages/SettingsPage';
import { CattleList } from './pages/CattleList';
import { CattleForm } from './pages/CattleForm';
import { CattleDetail } from './pages/CattleDetail';
import { CalfList } from './pages/CalfList';
import { CalfForm } from './pages/CalfForm';
import { CalfDetail } from './pages/CalfDetail';
import { BreedingList } from './pages/BreedingList';
import { BreedingForm } from './pages/BreedingForm';
import { VaccineList } from './pages/VaccineList';
import { VaccineForm } from './pages/VaccineForm';
import { BlvList } from './pages/BlvList';
import { BlvForm } from './pages/BlvForm';
import { ScheduleList } from './pages/ScheduleList';
import { ScheduleForm } from './pages/ScheduleForm';
import { TreatmentList } from './pages/TreatmentList';
import { TreatmentForm } from './pages/TreatmentForm';
import { ReportPage } from './pages/ReportPage';
import { BackupPage } from './pages/BackupPage';
import { PrintMenu } from './pages/PrintMenu';
import { PrintPage } from './pages/PrintPage';
import { SalesList } from './pages/SalesList';
import { SalesForm } from './pages/SalesForm';
import { SalesEditForm } from './pages/SalesEditForm';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AppLayout><Home /></AppLayout>} />
      <Route path="/alerts" element={<AppLayout><AlertPage /></AppLayout>} />
      <Route path="/calendar" element={<AppLayout><CalendarPage /></AppLayout>} />
      <Route path="/help" element={<AppLayout><HelpPage /></AppLayout>} />
      <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
      <Route path="/reports" element={<AppLayout><ReportPage /></AppLayout>} />
      <Route path="/print" element={<AppLayout><PrintMenu /></AppLayout>} />
      <Route path="/print/:kind" element={<AppLayout><PrintPage /></AppLayout>} />
      <Route path="/backups" element={<AppLayout><BackupPage /></AppLayout>} />

      <Route path="/schedules" element={<AppLayout><ScheduleList /></AppLayout>} />
      <Route path="/schedules/new" element={<AppLayout><ScheduleForm mode="create" /></AppLayout>} />
      <Route path="/schedules/:id/edit" element={<AppLayout><ScheduleForm mode="edit" /></AppLayout>} />

      <Route path="/treatments" element={<AppLayout><TreatmentList /></AppLayout>} />
      <Route path="/treatments/new" element={<AppLayout><TreatmentForm mode="create" /></AppLayout>} />
      <Route path="/treatments/:id/edit" element={<AppLayout><TreatmentForm mode="edit" /></AppLayout>} />

      <Route path="/cattle" element={<AppLayout><CattleList /></AppLayout>} />
      <Route path="/cattle/new" element={<AppLayout><CattleForm mode="create" /></AppLayout>} />
      <Route path="/cattle/:id" element={<AppLayout><CattleDetail /></AppLayout>} />
      <Route path="/cattle/:id/edit" element={<AppLayout><CattleForm mode="edit" /></AppLayout>} />

      <Route path="/calves" element={<AppLayout><CalfList /></AppLayout>} />
      <Route path="/calves/new" element={<AppLayout><CalfForm mode="create" /></AppLayout>} />
      <Route path="/calves/:id" element={<AppLayout><CalfDetail /></AppLayout>} />
      <Route path="/calves/:id/edit" element={<AppLayout><CalfForm mode="edit" /></AppLayout>} />

      <Route path="/breedings" element={<AppLayout><BreedingList /></AppLayout>} />
      <Route path="/breedings/new" element={<AppLayout><BreedingForm mode="create" /></AppLayout>} />
      <Route path="/breedings/:id/edit" element={<AppLayout><BreedingForm mode="edit" /></AppLayout>} />

      <Route path="/vaccines" element={<AppLayout><VaccineList /></AppLayout>} />
      <Route path="/vaccines/new" element={<AppLayout><VaccineForm mode="create" /></AppLayout>} />
      <Route path="/vaccines/:id/edit" element={<AppLayout><VaccineForm mode="edit" /></AppLayout>} />

      <Route path="/blv" element={<AppLayout><BlvList /></AppLayout>} />
      <Route path="/blv/new" element={<AppLayout><BlvForm mode="create" /></AppLayout>} />
      <Route path="/blv/:id/edit" element={<AppLayout><BlvForm mode="edit" /></AppLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/sales" element={<AppLayout><SalesList /></AppLayout>} />
      <Route path="/sales/new" element={<AppLayout><SalesForm /></AppLayout>} />
      <Route path="/sales/:id/edit" element={<AppLayout><SalesEditForm /></AppLayout>} />

    </Routes>
  );
}
