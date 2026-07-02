import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { CattleList } from './pages/CattleList';
import { CattleForm } from './pages/CattleForm';
import { CalfList } from './pages/CalfList';
import { CalfForm } from './pages/CalfForm';
import { BreedingList } from './pages/BreedingList';
import { BreedingForm } from './pages/BreedingForm';
import { VaccineList } from './pages/VaccineList';
import { VaccineForm } from './pages/VaccineForm';
import { BlvList } from './pages/BlvList';
import { BlvForm } from './pages/BlvForm';
import { ScheduleList } from './pages/ScheduleList';
import { ScheduleForm } from './pages/ScheduleForm';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AppLayout><Home /></AppLayout>} />
      <Route path="/schedules" element={<AppLayout><ScheduleList /></AppLayout>} />
      <Route path="/schedules/new" element={<AppLayout><ScheduleForm mode="create" /></AppLayout>} />
      <Route path="/schedules/:id/edit" element={<AppLayout><ScheduleForm mode="edit" /></AppLayout>} />
      <Route path="/cattle" element={<AppLayout><CattleList /></AppLayout>} />
      <Route path="/cattle/new" element={<AppLayout><CattleForm mode="create" /></AppLayout>} />
      <Route path="/cattle/:id/edit" element={<AppLayout><CattleForm mode="edit" /></AppLayout>} />
      <Route path="/calves" element={<AppLayout><CalfList /></AppLayout>} />
      <Route path="/calves/new" element={<AppLayout><CalfForm mode="create" /></AppLayout>} />
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
    </Routes>
  );
}
