import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth, fmtDate } from '../../api';
import { Alert, Badge, Field, Modal, Pager, useDebounced, useList } from '../../components/ui';

const REASONS = ['unknown_serial', 'no_fitment', 'multiple_kits', 'inactive_kit', 'unknown_assembly', 'no_stock', 'ambiguous_ocr', 'unreadable_photo', 'customer_requested'];
const tone = (s: string) => (s === 'open' ? 'red' : s === 'in_progress' ? 'amber' : 'green');

export default function Tickets() {
  const nav = useNavigate();
  const [status, setStatus] = useState('open');
  const [reason, setReason] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, page, setPage, reload } = useList<any>('/api/admin/tickets', { status, reason, q: dq });
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api(`/api/admin/tickets/${edit._id}`, {
        method: 'PATCH',
        body: { status: edit.status, assignedTo: edit.assignedTo, notes: edit.notes, resolution: edit.resolution, notifyCustomer: !!edit.notifyCustomer },
      });
      setEdit(null);
      void reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div>
      <h1>Review tickets</h1>
      <p className="muted">Created automatically when the bot cannot give a safe answer (unknown serial, no fitment, multiple kits, unreadable photo, no stock, customer asked for a human…).</p>
      <div className="filters">
        <input className="search" placeholder="Search ref, serial, phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason"><option value="">All reasons</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      </div>
      {error && <Alert>{error}</Alert>}
      <table className="table">
        <thead><tr><th>Ref</th><th>Reason</th><th>Serial / assembly</th><th>Customer</th><th>Status</th><th>Assigned</th><th>Created</th><th /></tr></thead>
        <tbody>
          {data?.items.map((t) => (
            <tr key={t._id}>
              <td><code>{t.ref}</code></td><td>{t.reason}</td>
              <td>{t.machineSerial ?? '—'} {t.assemblyCode && <>/ {t.assemblyCode}</>}</td>
              <td>{t.waId}</td><td><Badge tone={tone(t.status)}>{t.status}</Badge></td><td>{t.assignedTo || '—'}</td><td>{fmtDate(t.createdAt)}</td>
              <td className="nowrap"><button className="btn" onClick={() => { setEdit({ ...t }); setErr(''); }}>Open</button></td>
            </tr>
          ))}
          {!loading && data?.items.length === 0 && <tr><td colSpan={8} className="muted">No tickets match.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
      {edit && (
        <Modal title={`Ticket ${edit.ref}`} wide onClose={() => setEdit(null)}>
          <form onSubmit={save} className="form">
            {err && <Alert>{err}</Alert>}
            <p><b>{edit.reason}</b> — {edit.detail || 'no extra detail'}</p>
            <p className="muted">Serial: {edit.machineSerial ?? '—'} · Assembly: {edit.assemblyCode ?? '—'} · Suggested SKU: {edit.suggestedSku ?? '—'}</p>
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="open">open</option><option value="in_progress">in_progress</option><option value="resolved">resolved</option></select></Field>
            <Field label="Assigned to"><input value={edit.assignedTo} onChange={(e) => setEdit({ ...edit, assignedTo: e.target.value })} placeholder={auth.user?.email} /></Field>
            <Field label="Internal notes"><textarea rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <Field label="Resolution" hint="Required to resolve. Resolving releases the customer from human review."><textarea rows={2} value={edit.resolution} onChange={(e) => setEdit({ ...edit, resolution: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={!!edit.notifyCustomer} onChange={(e) => setEdit({ ...edit, notifyCustomer: e.target.checked })} /> Send the resolution to the customer in the chat</label>
            <div className="form-actions">
              <button className="btn primary">Save</button>
              <button type="button" className="btn" onClick={() => nav(`/admin/conversations?open=${edit.conversationId}`)}>View conversation</button>
              <button type="button" className="btn" onClick={() => setEdit(null)}>Close</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
