import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { AlertPage } from './pages/AlertPage';
import { CalendarPage } from './pages/CalendarPage';
import { HelpPage } from './pages/HelpPage';
import { SettingsPage } from './pages/SettingsPage';
import { MastersPage } from './pages/MastersPage';
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
import { ExpenseList } from './pages/ExpenseList';
import { ExpenseForm } from './pages/ExpenseForm';
import { ExpenseEditForm } from './pages/ExpenseEditForm';
import { MonthlyBalancePage } from './pages/MonthlyBalancePage';
import { FeedingList } from './pages/FeedingList';
import { FeedingForm } from './pages/FeedingForm';
import { FeedingEditForm } from './pages/FeedingEditForm';
import { FeedInventoryList } from './pages/FeedInventoryList';
import { FeedInventoryForm } from './pages/FeedInventoryForm';
import { FeedInventoryEditForm } from './pages/FeedInventoryEditForm';
import { FeedingGuideList } from './pages/FeedingGuideList';
import { FeedingGuideForm } from './pages/FeedingGuideForm';
import { FeedingGuideEditForm } from './pages/FeedingGuideEditForm';
import { FeedingAlertActionList } from './pages/FeedingAlertActionList';
import { FeedingAlertActionForm } from './pages/FeedingAlertActionForm';
import { FeedingAlertActionEditForm } from './pages/FeedingAlertActionEditForm';
import { PregnancyCheckList } from './pages/PregnancyCheckList';
import { CalvingForm } from './pages/CalvingForm';
import { CalvingList } from './pages/CalvingList';
import { CalvingEditForm } from './pages/CalvingEditForm';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AppLayout><Home /></AppLayout>} />
      <Route path="/alerts" element={<AppLayout><AlertPage /></AppLayout>} />
      <Route path="/calendar" element={<AppLayout><CalendarPage /></AppLayout>} />
      <Route path="/help" element={<AppLayout><HelpPage /></AppLayout>} />
      <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
      <Route path="/masters" element={<AppLayout><MastersPage /></AppLayout>} />
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
      <Route path="/breedings-advanced" element={<Navigate to="/breedings" replace />} />
      <Route path="/breedings-advanced/new" element={<Navigate to="/breedings/new" replace />} />

      <Route path="/vaccines" element={<AppLayout><VaccineList /></AppLayout>} />
      <Route path="/vaccines/new" element={<AppLayout><VaccineForm mode="create" /></AppLayout>} />
      <Route path="/vaccines/:id/edit" element={<AppLayout><VaccineForm mode="edit" /></AppLayout>} />

      <Route path="/blv" element={<AppLayout><BlvList /></AppLayout>} />
      <Route path="/blv/new" element={<AppLayout><BlvForm mode="create" /></AppLayout>} />
      <Route path="/blv/:id/edit" element={<AppLayout><BlvForm mode="edit" /></AppLayout>} />

      <Route path="/sales" element={<AppLayout><SalesList /></AppLayout>} />
      <Route path="/sales/new" element={<AppLayout><SalesForm /></AppLayout>} />
      <Route path="/sales/:id/edit" element={<AppLayout><SalesEditForm /></AppLayout>} />
      <Route path="/expenses" element={<AppLayout><ExpenseList /></AppLayout>} />
      <Route path="/expenses/new" element={<AppLayout><ExpenseForm /></AppLayout>} />
      <Route path="/expenses/:id/edit" element={<AppLayout><ExpenseEditForm /></AppLayout>} />
      <Route path="/monthly-balance" element={<AppLayout><MonthlyBalancePage /></AppLayout>} />
      <Route path="/feedings" element={<AppLayout><FeedingList /></AppLayout>} />
      <Route path="/feedings/new" element={<AppLayout><FeedingForm /></AppLayout>} />
      <Route path="/feedings/:id/edit" element={<AppLayout><FeedingEditForm /></AppLayout>} />
      <Route path="/feed-inventory" element={<AppLayout><FeedInventoryList /></AppLayout>} />
      <Route path="/feed-inventory/new" element={<AppLayout><FeedInventoryForm /></AppLayout>} />
      <Route path="/feed-inventory/:id/edit" element={<AppLayout><FeedInventoryEditForm /></AppLayout>} />
      <Route path="/feeding-guide" element={<AppLayout><FeedingGuideList /></AppLayout>} />
      <Route path="/feeding-guide/new" element={<AppLayout><FeedingGuideForm /></AppLayout>} />
      <Route path="/feeding-guide/:id/edit" element={<AppLayout><FeedingGuideEditForm /></AppLayout>} />
      <Route path="/feeding-alert-actions" element={<AppLayout><FeedingAlertActionList /></AppLayout>} />
      <Route path="/feeding-alert-actions/new" element={<AppLayout><FeedingAlertActionForm /></AppLayout>} />
      <Route path="/feeding-alert-actions/:id/edit" element={<AppLayout><FeedingAlertActionEditForm /></AppLayout>} />
      <Route path="/pregnancy-checks" element={<AppLayout><PregnancyCheckList /></AppLayout>} />
      <Route path="/calvings" element={<AppLayout><CalvingList /></AppLayout>} />
      <Route path="/calvings/new" element={<AppLayout><CalvingForm /></AppLayout>} />
      <Route path="/calvings/:id/edit" element={<AppLayout><CalvingEditForm /></AppLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
