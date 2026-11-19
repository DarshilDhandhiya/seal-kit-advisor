import { FormEvent, useEffect, useState } from 'react';
import { api, assetUrl, auth } from '../../api';
import { Alert, Badge, Field, Modal, Pager, useDebounced, useList } from '../../components/ui';

const empty = { sku: '', name: '', assemblyCode: 'BOOM', demoPriceINR: 0, stock: 0, imageUrl: '', description: 'Fictional seal kit for developer testing only; verify real parts with supplier.', active: true };

export default function Kits() {
  const isAdmin = auth.user?.role === 'admin';
  const [q, setQ] = useState('');
  const [asm, setAsm] = useState('');
  const [active, setActive] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, page, setPage, reload } = useList<any>('/api/admin/kits', { q: dq, assemblyCode: asm, active });
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/admin/assemblies').then((d) => setAssemblies(d.items)).catch(() => undefined); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const body = { sku: edit.sku, name: edit.name, assemblyCode: edit.assemblyCode, demoPriceINR: Number(edit.demoPriceINR), stock: Number(edit.stock), imageUrl: edit.imageUrl, description: edit.description, active: !!edit.active };
      if (isNew) await api('/api/admin/kits', { method: 'POST', body });
      else {
        const { sku, ...rest } = body;
        await api(`/api/admin/kits/${sku}`, { method: 'PATCH', body: rest });
      }
      setEdit(null);
      void reload();
    } catch (x: any) {
      setErr(x.message);
    }
  };
  const del = async (k: any) => {
    if (!confirm(`Delete kit ${k.sku}? (Kits used by fitments cannot be deleted — deactivate them instead.)`)) return;
    try { await api(`/api/admin/kits/${k.sku}`, { method: 'DELETE' }); void reload(); } catch (x: any) { alert(x.message); }
  };
  const quickStock = async (k: any, delta: number) => {
    try { await api(`/api/admin/kits/${k.sku}`, { method: 'PATCH', body: { stock: Math.max(0, k.stock + delta) } }); void reload(); } catch (x: any) { alert(x.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Kits &amp; stock</h1>
        {isAdmin && <button className="btn primary" onClick={() => { setIsNew(true); setEdit({ ...empty }); setErr(''); }}>+ Add kit</button>}
      </div>
      <div className="filters">
        <input className="search" placeholder="Search SKU or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search kits" />
        <select value={asm} onChange={(e) => setAsm(e.target.value)} aria-label="Assembly"><option value="">All assemblies</option>{assemblies.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select>
        <select value={active} onChange={(e) => setActive(e.target.value)} aria-label="Active"><option value="">Active + inactive</option><option value="true">Active</option><option value="false">Inactive</option></select>
      </div>
      {!isAdmin && <Alert kind="info">You are signed in as staff: the catalogue is read-only. Ask an admin to change kits, stock or fitments.</Alert>}
      {error && <Alert>{error}</Alert>}
      <table className="table">
        <thead><tr><th /><th>SKU</th><th>Name</th><th>Assembly</th><th>Price (INR)</th><th>Stock</th><th>Active</th>{isAdmin && <th />}</tr></thead>
        <tbody>
          {data?.items.map((k) => (
            <tr key={k.sku}>
              <td><img className="thumb" src={assetUrl(k.imageUrl)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /></td>
              <td><code>{k.sku}</code></td><td>{k.name}</td><td>{k.assemblyCode}</td><td>₹{k.demoPriceINR.toLocaleString('en-IN')}</td>
              <td>
                <Badge tone={k.stock === 0 ? 'red' : k.stock <= 3 ? 'amber' : 'green'}>{k.stock}</Badge>{' '}
                {isAdmin && <><button className="btn tiny" aria-label={`Decrease stock of ${k.sku}`} onClick={() => quickStock(k, -1)}>−</button><button className="btn tiny" aria-label={`Increase stock of ${k.sku}`} onClick={() => quickStock(k, 1)}>+</button></>}
              </td>
              <td>{k.active ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge>}</td>
              {isAdmin && <td className="nowrap"><button className="btn" onClick={() => { setIsNew(false); setEdit({ ...k }); setErr(''); }}>Edit</button> <button className="btn danger" onClick={() => del(k)}>Delete</button></td>}
            </tr>
          ))}
          {!loading && data?.items.length === 0 && <tr><td colSpan={8} className="muted">No kits match.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
      {edit && (
        <Modal title={isNew ? 'Add kit' : `Edit ${edit.sku}`} onClose={() => setEdit(null)}>
          <form onSubmit={save} className="form">
            {err && <Alert>{err}</Alert>}
            <Field label="SKU"><input value={edit.sku} disabled={!isNew} onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })} required /></Field>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></Field>
            <Field label="Assembly"><select value={edit.assemblyCode} onChange={(e) => setEdit({ ...edit, assemblyCode: e.target.value })}>{assemblies.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select></Field>
            <Field label="Demo price (INR)"><input type="number" min={0} value={edit.demoPriceINR} onChange={(e) => setEdit({ ...edit, demoPriceINR: e.target.value })} required /></Field>
            <Field label="Stock"><input type="number" min={0} step={1} value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} required /></Field>
            <Field label="Image URL" hint="e.g. /demo/kits/DK-BHL-A-BOOM.png"><input value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} /></Field>
            <Field label="Description"><textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} /></Field>
            <label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active (inactive kits are never recommended)</label>
            <div className="form-actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
