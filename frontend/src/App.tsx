import { ReactElement, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { auth } from './api';
import Simulator from './pages/Simulator';
import Login from './pages/admin/Login';
import AdminLayout from './pages/admin/Layout';
import Overview from './pages/admin/Overview';
import Machines from './pages/admin/Machines';
import Kits from './pages/admin/Kits';
import Fitments from './pages/admin/Fitments';
import Tickets from './pages/admin/Tickets';
import Leads from './pages/admin/Leads';
import Conversations from './pages/admin/Conversations';
import Audit from './pages/admin/Audit';

function RequireAuth({ children }: { children: ReactElement }) {
  return auth.token ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  const nav = useNavigate();
  useEffect(() => {
    const h = () => nav('/admin/login', { replace: true });
    window.addEventListener('sealkit:logout', h);
    return () => window.removeEventListener('sealkit:logout', h);
  }, [nav]);

  return (
    <Routes>
      <Route path="/" element={<Simulator />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Overview />} />
        <Route path="machines" element={<Machines />} />
        <Route path="kits" element={<Kits />} />
        <Route path="fitments" element={<Fitments />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="leads" element={<Leads />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="audit" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
