import { useState } from 'react';
import { fmtDate } from '../../api';
import { Alert, Pager, useList } from '../../components/ui';

export default function Audit() {
  const [entity, setEntity] = useState('');
  const { data, error, page, setPage } = useList<any>('/api/admin/audit', { entity });
  return (
    <div>
      <h1>Audit trail</h1>
      <p className="muted">Append-only record of catalogue, fitment, ticket, lead and photo-access changes (who / what / before / after).</p>
      <div className="filters">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All entities</option>{['kit', 'fitment', 'machine', 'ticket', 'lead', 'conversation', 'media'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {error && <Alert>{error}</Alert>}
      <table className="table">
        <thead><tr><th>When</th><th>Who</th><th>Entity</th><th>Action</th><th>Change</th></tr></thead>
        <tbody>
          {data?.items.map((a) => (
            <tr key={a._id}>
              <td className="nowrap">{fmtDate(a.at)}</td><td>{a.actor}</td><td>{a.entity} <code>{String(a.entityId).slice(0, 24)}</code></td><td>{a.action}</td>
              <td><details><summary>before / after</summary><pre>{JSON.stringify({ before: a.before, after: a.after }, null, 1)}</pre></details></td>
            </tr>
          ))}
          {data?.items.length === 0 && <tr><td colSpan={5} className="muted">No audit entries yet — edit a kit or fitment to see one.</td></tr>}
        </tbody>
      </table>
      {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
    </div>
  );
}
