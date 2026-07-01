import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { CattleList } from './pages/CattleList';
import { CattleForm } from './pages/CattleForm';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AppLayout><Home /></AppLayout>} />
      <Route path="/cattle" element={<AppLayout><CattleList /></AppLayout>} />
      <Route path="/cattle/new" element={<AppLayout><CattleForm mode="create" /></AppLayout>} />
      <Route path="/cattle/:id/edit" element={<AppLayout><CattleForm mode="edit" /></AppLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
