import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth } from '../../api';

const LINKS = [
  ['/admin', 'Overview', true],
  ['/admin/conversations', 'Conversations'],
  ['/admin/tickets', 'Review tickets'],
  ['/admin/leads', 'Leads'],
  ['/admin/kits', 'Kits'],
  ['/admin/fitments', 'Fitments'],
  ['/admin/machines', 'Machines'],
  ['/admin/audit', 'Audit trail'],
] as const;

export default function AdminLayout() {
  const nav = useNavigate();
  const user = auth.user;
  return (
    <div className="admin">
      <aside className="sidebar">
        <h2>Seal-Kit Console <span className="demo-pill">DEMO</span></h2>
        <nav aria-label="Admin">
          {LINKS.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={'end' in { end } && !!end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div><strong>{user?.email}</strong><br /><small>role: {user?.role}</small></div>
          <a className="btn" href="/" target="_blank" rel="noreferrer">Open simulator ↗</a>
          <button className="btn" onClick={() => { auth.clear(); nav('/admin/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
