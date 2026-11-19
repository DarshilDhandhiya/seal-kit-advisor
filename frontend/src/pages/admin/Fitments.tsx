import { FormEvent, useEffect, useState } from 'react';
import { api, auth, fmtDate } from '../../api';
import { Alert, Badge, Field, Modal, Pager, useDebounced, useList } from '../../components/ui';

const empty = { machineSerial: '', assemblyCode: 'BOOM', kitSku: '', evidenceSource: '', verified: false, active: true };

export default function Fitments() {
  const isAdmin = auth.user?.role === 'admin';
  const [serial, setSerial] = useState('');
  const [asm, setAsm] = useState('');
  const [verified, setVerified] = useState('');
  const ds = useDebounced(serial);
  const { data, error, loading, page, setPage, reload } = useList<any>('/api/admin/fitments', { serial: ds, assemblyCode: asm, verified });
  const [machines, setMachines] = useState<any[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<{ id: string; items: any[] } | null>(null);

  useEffect(() => {
    api('/api/admin/machines?limit=200').then((d) => setMachines(d.items)).catch(() => undefined);
    api('/api/admin/assemblies').then((d) => setAssemblies(d.items)).catch(() => undefined);
    api('/api/admin/kits?limit=200').then((d) => setKits(d.items)).catch(() => undefined);
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const body = { machineSerial: edit.machineSerial, assemblyCode: edit.assemblyCode, kitSku: edit.kitSku, evidenceSource: edit.evidenceSource, verified: !!edit.verified, active: !!edit.active };
      if (isNew) await api('/api/admin/fitments', { method: 'POST', body });
      else await api(`/api/admin/fitments/${edit._id}`, { method: 'PATCH', body });
      setEdit(null);
      void reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };
  const del = async (f: any) => {
    if (!confirm(`Delete fitment ${f.machineSerial} + ${f.assemblyCode} → ${f.kitSku}?`)) return;
    try { await api(`/api/admin/fitments/${f._id}`, { method: 'DELETE' }); void reload(); } catch (x: any) { alert(x.message); }
  };
  const showHistory = async (f: any) => {
    const d = await api(`/api/admin/audit?entity=fitment&entityId=${f._id}&limit=50`);
    setHistory({ id: `${f.machineSerial} + ${f.assemblyCode}`, items: d.items });
  };
  const kitOptions = kits.filter((k) => !edit || k.assemblyCode === edit.assemblyCode);

  return (
    <div>
      <div className="page-head">
        <h1>Fitments</h1>
        {isAdmin && <button className="btn primary" onClick={() => { setIsNew(true); setEdit({ ...empty }); setErr(''); }}>+ Add fitment</button>}
      </div>
      <p className="muted">Only <b>active + verified</b> fitments for the <b>exact serial + assembly</b> are used by the bot. Verified requires evidence. Every change is audited.</p>
      <div className="filters">
        <input className="search" placeholder="Filter by serial…" value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Filter serial" />
        <select value={asm} onChange={(e) => setAsm(e.target.value)} aria-label="Assembly"><option value="">All assemblies</option>{assemblies.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select>
        <select value={verified} onChange={(e) => setVerified(e.target.value)} aria-label="Verified"><option value="">Verified + unverified</option><option value="true">Verified</option><option value="false">Unverified</option></select>
      </div>
      {error && <Alert>{error}</Alert>}
      <table className="table">
        <thead><tr><th>Machine serial</th><th>Assembly</th><th>Kit SKU</th><th>Evidence</th><th>Verified</th><th>Active</th><th /></tr></thead>
        <tbody>
          {data?.items.map((f) => (
            <tr key={f._id}>
              <td><code>{f.machineSerial}</code></td><td>{f.assemblyCode}</td><td><code>{f.kitSku}</code></td><td className="muted">{f.evidenceSource || '—'}</td>
              <td>{f.verified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}</td>
              <td>{f.active ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge>}</td>
              <td className="nowrap">
                <button className="btn" onClick={() => showHistory(f)}>History</button>{' '}
                {isAdmin && <><button className="btn" onClick={() => { setIsNew(false); setEdit({ ...f }); setErr(''); }}>Edit</button> <button className="btn danger" onClick={() => del(f)}>Delete</button></>}
              </td>
            </tr>
          ))}
          {!loading && data?.items.length === 0 && <tr><td colSpan={7} className="muted">No fitments match.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}

      {edit && (
        <Modal title={isNew ? 'Add fitment' : 'Edit fitment'} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="form">
            {err && <Alert>{err}</Alert>}
            <Field label="Machine serial"><select value={edit.machineSerial} onChange={(e) => setEdit({ ...edit, machineSerial: e.target.value })} required><option value="">Select…</option>{machines.map((m) => <option key={m.serial} value={m.serial}>{m.serial} ({m.model})</option>)}</select></Field>
            <Field label="Assembly"><select value={edit.assemblyCode} onChange={(e) => setEdit({ ...edit, assemblyCode: e.target.value, kitSku: '' })}>{assemblies.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select></Field>
            <Field label="Kit" hint="Only kits of the selected assembly are listed"><select value={edit.kitSku} onChange={(e) => setEdit({ ...edit, kitSku: e.target.value })} required><option value="">Select…</option>{kitOptions.map((k) => <option key={k.sku} value={k.sku}>{k.sku} — {k.name}</option>)}</select></Field>
            <Field label="Evidence source" hint="Required before a fitment can be marked verified (e.g. 'Supplier catalogue p.14')"><input value={edit.evidenceSource} onChange={(e) => setEdit({ ...edit, evidenceSource: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={!!edit.verified} disabled={edit.evidenceSource.trim().length < 3} onChange={(e) => setEdit({ ...edit, verified: e.target.checked })} /> Verified {edit.evidenceSource.trim().length < 3 && <small>(enter evidence first)</small>}</label>
            <label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            <div className="form-actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
      {history && (
        <Modal title={`Change history — ${history.id}`} wide onClose={() => setHistory(null)}>
          {history.items.length === 0 && <p className="muted">No recorded changes (seed data is not audited).</p>}
          {history.items.map((a) => (
            <div key={a._id} className="audit-item">
              <b>{a.action}</b> by {a.actor} · {fmtDate(a.at)}
              <pre>{JSON.stringify({ before: a.before, after: a.after }, null, 1)}</pre>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
