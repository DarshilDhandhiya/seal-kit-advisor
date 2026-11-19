import { FormEvent, useState } from 'react';
import { api, auth } from '../../api';
import { Alert, Badge, Field, Modal, Pager, useDebounced, useList } from '../../components/ui';

const empty = { serial: '', model: '', family: '', variant: '', year: new Date().getFullYear(), status: 'active', notes: '' };

export default function Machines() {
  const isAdmin = auth.user?.role === 'admin';
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, page, setPage, reload } = useList<any>('/api/admin/machines', { q: dq });
  const [edit, setEdit] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const body = { ...edit, year: Number(edit.year) };
      if (isNew) await api('/api/admin/machines', { method: 'POST', body });
      else {
        const { serial, _id, __v, createdAt, updatedAt, ...rest } = body;
        await api(`/api/admin/machines/${serial}`, { method: 'PATCH', body: rest });
      }
      setEdit(null);
      void reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Machines</h1>
        {isAdmin && <button className="btn primary" onClick={() => { setIsNew(true); setEdit({ ...empty }); setErr(''); }}>+ Add machine</button>}
      </div>
      <input className="search" placeholder="Search serial or model…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search machines" />
      {error && <Alert>{error}</Alert>}
      <table className="table">
        <thead><tr><th>Serial</th><th>Model</th><th>Family</th><th>Variant</th><th>Year</th><th>Status</th><th>Notes</th>{isAdmin && <th />}</tr></thead>
        <tbody>
          {data?.items.map((m) => (
            <tr key={m.serial}>
              <td><code>{m.serial}</code></td><td>{m.model}</td><td>{m.family}</td><td>{m.variant}</td><td>{m.year}</td>
              <td><Badge tone={m.status === 'active' ? 'green' : 'grey'}>{m.status}</Badge></td>
              <td className="muted">{m.notes}</td>
              {isAdmin && <td><button className="btn" onClick={() => { setIsNew(false); setEdit({ ...m }); setErr(''); }}>Edit</button></td>}
            </tr>
          ))}
          {!loading && data?.items.length === 0 && <tr><td colSpan={8} className="muted">No machines match.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
      {edit && (
        <Modal title={isNew ? 'Add machine' : `Edit ${edit.serial}`} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="form">
            {err && <Alert>{err}</Alert>}
            <Field label="Serial" hint="Format DEMO-XXX-0000"><input value={edit.serial} disabled={!isNew} onChange={(e) => setEdit({ ...edit, serial: e.target.value.toUpperCase() })} required /></Field>
            <Field label="Model"><input value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} required /></Field>
            <Field label="Family"><input value={edit.family} onChange={(e) => setEdit({ ...edit, family: e.target.value.toUpperCase() })} required /></Field>
            <Field label="Variant"><input value={edit.variant} onChange={(e) => setEdit({ ...edit, variant: e.target.value })} required /></Field>
            <Field label="Year"><input type="number" value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} required /></Field>
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>active</option><option>inactive</option></select></Field>
            <Field label="Notes"><input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <div className="form-actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
