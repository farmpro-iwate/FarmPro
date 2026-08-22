import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { getStoredAuthUser, hasAuthToken } from './services/authClient';
import { Home } from './pages/Home';
import { AlertPage } from './pages/AlertPage';
import { CalendarPage } from './pages/CalendarPage';
import { HelpPage } from './pages/HelpPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { LogoutPage } from './pages/LogoutPage';
import { PaidPlanApplicationPage } from './pages/PaidPlanApplicationPage';
import { OperatorBankTransfersPage } from './pages/OperatorBankTransfersPage';
import { TermsPage, PrivacyPage, CommercePage } from './pages/LegalPages';
import { DeviceSyncPage } from './pages/DeviceSyncPage';
import { MastersPage } from './pages/MastersPage';
import { AnimalImportPage } from './pages/AnimalImportPage';
import { CattleList } from './pages/CattleList';
import { CattleForm } from './pages/CattleForm';
import { CattleDetail } from './pages/CattleDetail';
import { CalfList } from './pages/CalfList';
import { CalfForm } from './pages/CalfForm';
import { CalfDetail } from './pages/CalfDetail';
import { BreedingList } from './pages/BreedingList';
import { BreedingForm } from './pages/BreedingForm';
import { HeatRegistrationForm } from './pages/HeatRegistrationForm';
import { BreedingExecutionForm } from './pages/BreedingExecutionForm';
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
import { MarketShippingPlan } from './pages/MarketShippingPlan';
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
import { PregnancyCheckEdit } from './pages/PregnancyCheckEdit';
import { CalvingForm } from './pages/CalvingForm';
import { CalvingList } from './pages/CalvingList';
import { CalvingEditForm } from './pages/CalvingEditForm';
import { FatteningTransitionForm } from './pages/FatteningTransitionForm';
import { FatteningTransitionList } from './pages/FatteningTransitionList';
import { FatteningTransitionEditForm } from './pages/FatteningTransitionEditForm';

function RequireRegistration({ children }: { children: React.ReactNode }) {
  const registered = Boolean(getStoredAuthUser() && hasAuthToken());
  return registered ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route path="/terms" element={<AppLayout><TermsPage /></AppLayout>} />
      <Route path="/privacy" element={<AppLayout><PrivacyPage /></AppLayout>} />
      <Route path="/commerce" element={<AppLayout><CommercePage /></AppLayout>} />

      <Route path="/paid-plan" element={<RequireRegistration><AppLayout><PaidPlanApplicationPage /></AppLayout></RequireRegistration>} />
      <Route path="/operator/bank-transfers" element={<RequireRegistration><AppLayout><OperatorBankTransfersPage /></AppLayout></RequireRegistration>} />
      <Route path="/device-sync" element={<RequireRegistration><AppLayout><DeviceSyncPage /></AppLayout></RequireRegistration>} />
      <Route path="/" element={<RequireRegistration><AppLayout><Home /></AppLayout></RequireRegistration>} />
      <Route path="/alerts" element={<RequireRegistration><AppLayout><AlertPage /></AppLayout></RequireRegistration>} />
      <Route path="/calendar" element={<RequireRegistration><AppLayout><CalendarPage /></AppLayout></RequireRegistration>} />
      <Route path="/help" element={<RequireRegistration><AppLayout><HelpPage /></AppLayout></RequireRegistration>} />
      <Route path="/settings" element={<RequireRegistration><AppLayout><SettingsPage /></AppLayout></RequireRegistration>} />
      <Route path="/masters" element={<RequireRegistration><AppLayout><MastersPage /></AppLayout></RequireRegistration>} />
      <Route path="/animal-import" element={<RequireRegistration><AppLayout><AnimalImportPage /></AppLayout></RequireRegistration>} />
      <Route path="/reports" element={<RequireRegistration><AppLayout><ReportPage /></AppLayout></RequireRegistration>} />
      <Route path="/print" element={<RequireRegistration><AppLayout><PrintMenu /></AppLayout></RequireRegistration>} />
      <Route path="/print/:kind" element={<RequireRegistration><AppLayout><PrintPage /></AppLayout></RequireRegistration>} />
      <Route path="/backups" element={<RequireRegistration><AppLayout><BackupPage /></AppLayout></RequireRegistration>} />

      <Route path="/schedules" element={<RequireRegistration><AppLayout><ScheduleList /></AppLayout></RequireRegistration>} />
      <Route path="/schedules/new" element={<RequireRegistration><AppLayout><ScheduleForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/schedules/:id/edit" element={<RequireRegistration><AppLayout><ScheduleForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/treatments" element={<RequireRegistration><AppLayout><TreatmentList /></AppLayout></RequireRegistration>} />
      <Route path="/treatments/new" element={<RequireRegistration><AppLayout><TreatmentForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/treatments/:id/edit" element={<RequireRegistration><AppLayout><TreatmentForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/cattle" element={<RequireRegistration><AppLayout><CattleList /></AppLayout></RequireRegistration>} />
      <Route path="/cattle/new" element={<RequireRegistration><AppLayout><CattleForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/cattle/:id" element={<RequireRegistration><AppLayout><CattleDetail /></AppLayout></RequireRegistration>} />
      <Route path="/cattle/:id/edit" element={<RequireRegistration><AppLayout><CattleForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/calves" element={<RequireRegistration><AppLayout><CalfList /></AppLayout></RequireRegistration>} />
      <Route path="/calves/new" element={<RequireRegistration><AppLayout><CalfForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/calves/:id" element={<RequireRegistration><AppLayout><CalfDetail /></AppLayout></RequireRegistration>} />
      <Route path="/calves/:id/edit" element={<RequireRegistration><AppLayout><CalfForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/breedings" element={<RequireRegistration><AppLayout><BreedingList /></AppLayout></RequireRegistration>} />
      <Route path="/breedings/new" element={<RequireRegistration><AppLayout><HeatRegistrationForm /></AppLayout></RequireRegistration>} />
      <Route path="/breedings/:id/insemination" element={<RequireRegistration><AppLayout><BreedingExecutionForm kind="insemination" /></AppLayout></RequireRegistration>} />
      <Route path="/breedings/:id/transfer" element={<RequireRegistration><AppLayout><BreedingExecutionForm kind="transfer" /></AppLayout></RequireRegistration>} />
      <Route path="/breedings/:id/edit" element={<RequireRegistration><AppLayout><BreedingForm mode="edit" /></AppLayout></RequireRegistration>} />
      <Route path="/breedings-advanced" element={<Navigate to="/breedings" replace />} />
      <Route path="/breedings-advanced/new" element={<Navigate to="/breedings/new" replace />} />

      <Route path="/vaccines" element={<RequireRegistration><AppLayout><VaccineList /></AppLayout></RequireRegistration>} />
      <Route path="/vaccines/new" element={<RequireRegistration><AppLayout><VaccineForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/vaccines/:id/edit" element={<RequireRegistration><AppLayout><VaccineForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/blv" element={<RequireRegistration><AppLayout><BlvList /></AppLayout></RequireRegistration>} />
      <Route path="/blv/new" element={<RequireRegistration><AppLayout><BlvForm mode="create" /></AppLayout></RequireRegistration>} />
      <Route path="/blv/:id/edit" element={<RequireRegistration><AppLayout><BlvForm mode="edit" /></AppLayout></RequireRegistration>} />

      <Route path="/market-shipping-plan" element={<RequireRegistration><AppLayout><MarketShippingPlan /></AppLayout></RequireRegistration>} />
      <Route path="/sales" element={<RequireRegistration><AppLayout><SalesList /></AppLayout></RequireRegistration>} />
      <Route path="/sales/new" element={<RequireRegistration><AppLayout><SalesForm /></AppLayout></RequireRegistration>} />
      <Route path="/sales/:id/edit" element={<RequireRegistration><AppLayout><SalesEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/fattening-transitions" element={<RequireRegistration><AppLayout><FatteningTransitionList /></AppLayout></RequireRegistration>} />
      <Route path="/fattening-transitions/new" element={<RequireRegistration><AppLayout><FatteningTransitionForm /></AppLayout></RequireRegistration>} />
      <Route path="/fattening-transitions/:id/edit" element={<RequireRegistration><AppLayout><FatteningTransitionEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/expenses" element={<RequireRegistration><AppLayout><ExpenseList /></AppLayout></RequireRegistration>} />
      <Route path="/expenses/new" element={<RequireRegistration><AppLayout><ExpenseForm /></AppLayout></RequireRegistration>} />
      <Route path="/expenses/:id/edit" element={<RequireRegistration><AppLayout><ExpenseEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/monthly-balance" element={<RequireRegistration><AppLayout><MonthlyBalancePage /></AppLayout></RequireRegistration>} />
      <Route path="/feedings" element={<RequireRegistration><AppLayout><FeedingList /></AppLayout></RequireRegistration>} />
      <Route path="/feedings/new" element={<RequireRegistration><AppLayout><FeedingForm /></AppLayout></RequireRegistration>} />
      <Route path="/feedings/:id/edit" element={<RequireRegistration><AppLayout><FeedingEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/feed-inventory" element={<RequireRegistration><AppLayout><FeedInventoryList /></AppLayout></RequireRegistration>} />
      <Route path="/feed-inventory/new" element={<RequireRegistration><AppLayout><FeedInventoryForm /></AppLayout></RequireRegistration>} />
      <Route path="/feed-inventory/:id/edit" element={<RequireRegistration><AppLayout><FeedInventoryEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-guide" element={<RequireRegistration><AppLayout><FeedingGuideList /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-guide/new" element={<RequireRegistration><AppLayout><FeedingGuideForm /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-guide/:id/edit" element={<RequireRegistration><AppLayout><FeedingGuideEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-alert-actions" element={<RequireRegistration><AppLayout><FeedingAlertActionList /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-alert-actions/new" element={<RequireRegistration><AppLayout><FeedingAlertActionForm /></AppLayout></RequireRegistration>} />
      <Route path="/feeding-alert-actions/:id/edit" element={<RequireRegistration><AppLayout><FeedingAlertActionEditForm /></AppLayout></RequireRegistration>} />
      <Route path="/pregnancy-checks" element={<RequireRegistration><AppLayout><PregnancyCheckList /></AppLayout></RequireRegistration>} />
      <Route path="/pregnancy-checks/:id/edit" element={<RequireRegistration><AppLayout><PregnancyCheckEdit /></AppLayout></RequireRegistration>} />
      <Route path="/calvings" element={<RequireRegistration><AppLayout><CalvingList /></AppLayout></RequireRegistration>} />
      <Route path="/calvings/new" element={<RequireRegistration><AppLayout><CalvingForm /></AppLayout></RequireRegistration>} />
      <Route path="/calvings/:id/edit" element={<RequireRegistration><AppLayout><CalvingEditForm /></AppLayout></RequireRegistration>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}