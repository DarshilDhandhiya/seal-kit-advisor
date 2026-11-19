import { useState } from 'react';
import { api, auth, downloadFile, fmtDate } from '../../api';
import { Alert, Badge, Pager, useDebounced, useList } from '../../components/ui';

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export default function Leads() {
  const isAdmin = auth.user?.role === 'admin';
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, page, setPage, reload } = useList<any>('/api/admin/leads', { status, q: dq });
  const [msg, setMsg] = useState('');

  const setLead = async (id: string, body: object) => {
    try { await api(`/api/admin/leads/${id}`, { method: 'PATCH', body }); void reload(); } catch (x: any) { setMsg(x.message); }
  };
  const del = async (l: any) => {
    if (!confirm(`Delete lead ${l.ref} (customer deletion request)?`)) return;
    try { await api(`/api/admin/leads/${l._id}`, { method: 'DELETE' }); void reload(); } catch (x: any) { setMsg(x.message); }
  };
  const exportCsv = async () => {
    try { await downloadFile(`/api/admin/leads/export.csv${status ? `?status=${status}` : ''}`, `leads-${new Date().toISOString().slice(0, 10)}.csv`); } catch (x: any) { setMsg(x.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Leads (quote requests)</h1>
        <button className="btn primary" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      <p className="muted">Stored only with the customer’s explicit consent in the chat. Contains personal data — access is restricted to signed-in staff.</p>
      <div className="filters">
        <input className="search" placeholder="Search name, city, phone, ref…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {(error || msg) && <Alert>{error || msg}</Alert>}
      <table className="table">
        <thead><tr><th>Ref</th><th>Customer</th><th>Phone</th><th>City</th><th>Machine / assembly</th><th>Kit</th><th>Status</th><th>Consent</th><th>Created</th>{isAdmin && <th />}</tr></thead>
        <tbody>
          {data?.items.map((l) => (
            <tr key={l._id}>
              <td><code>{l.ref}</code></td><td>{l.customerName}</td><td>{l.phone}</td><td>{l.city}</td>
              <td>{l.machineSerial ?? '—'} / {l.assemblyCode ?? '—'}</td><td>{l.suggestedSku ?? '—'}</td>
              <td><select value={l.status} aria-label={`Status of ${l.ref}`} onChange={(e) => setLead(l._id, { status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
              <td>{l.consent ? <Badge tone="green">yes</Badge> : <Badge tone="red">no</Badge>}</td><td>{fmtDate(l.createdAt)}</td>
              {isAdmin && <td><button className="btn danger" onClick={() => del(l)}>Delete</button></td>}
            </tr>
          ))}
          {!loading && data?.items.length === 0 && <tr><td colSpan={10} className="muted">No leads yet. Request a quote in the simulator to create one.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
    </div>
  );
}
