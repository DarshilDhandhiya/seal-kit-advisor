import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Alert, Badge, stateTone } from '../../components/ui';

export default function Overview() {
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/admin/stats').then(setS).catch((e) => setError(e.message));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!s) return <p>Loading…</p>;
  const cards: Array<[string, number, string]> = [
    ['Open review tickets', s.openTickets, '/admin/tickets'],
    ['New leads', s.newLeads, '/admin/leads'],
    ['Conversations', s.conversations, '/admin/conversations'],
    ['Messages', s.messages, '/admin/conversations'],
    ['Kits', s.kits, '/admin/kits'],
    ['Machines', s.machines, '/admin/machines'],
    ['Fitments', s.fitments, '/admin/fitments'],
  ];
  return (
    <div>
      <h1>Overview</h1>
      <div className="cards">
        {cards.map(([label, n, to]) => (
          <Link key={label} to={to} className="stat">
            <strong>{n}</strong>
            <span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="two-col">
        <section className="card">
          <h3>Conversations by state</h3>
          {Object.keys(s.byState).length === 0 && <p className="muted">No conversations yet — try the simulator.</p>}
          {Object.entries(s.byState).map(([k, v]) => (
            <p key={k}><Badge tone={stateTone(k)}>{k}</Badge> {String(v)}</p>
          ))}
        </section>
        <section className="card">
          <h3>Low / zero stock kits (active)</h3>
          {s.lowStock.length === 0 && <p className="muted">None.</p>}
          {s.lowStock.map((k: any) => (
            <p key={k.sku}><Badge tone={k.stock === 0 ? 'red' : 'amber'}>{k.stock}</Badge> {k.sku} — {k.name}</p>
          ))}
        </section>
      </div>
    </div>
  );
}
