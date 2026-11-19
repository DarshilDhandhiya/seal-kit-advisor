import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, auth, blobUrl, fmtDate } from '../../api';
import { Alert, Badge, Pager, stateTone, useDebounced, useList } from '../../components/ui';

function PlatePhoto({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let u = '';
    blobUrl(`/api/admin/messages/${id}/media`).then((x) => { u = x; setUrl(x); }).catch((e) => setErr(e.message));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (err) return <small className="muted">Photo unavailable: {err}</small>;
  return url ? <img className="plate-photo" src={url} alt="Customer plate photo" /> : <small className="muted">Loading photo…</small>;
}

export default function Conversations() {
  const isAdmin = auth.user?.role === 'admin';
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const dq = useDebounced(q);
  const { data, error, page, setPage, reload } = useList<any>('/api/admin/conversations', { q: dq, state });
  const [sel, setSel] = useState<string | null>(sp.get('open'));
  const [detail, setDetail] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!sel) return setDetail(null);
    try { setDetail(await api(`/api/admin/conversations/${sel}`)); setErr(''); } catch (e: any) { setErr(e.message); }
  }, [sel]);
  useEffect(() => { void load(); }, [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !sel) return;
    try { await api(`/api/admin/conversations/${sel}/reply`, { method: 'POST', body: { text: reply } }); setReply(''); await load(); } catch (x: any) { setErr(x.message); }
  };
  const del = async () => {
    if (!sel || !confirm('Delete this conversation, all messages and stored photos? This cannot be undone.')) return;
    try { await api(`/api/admin/conversations/${sel}`, { method: 'DELETE' }); setSel(null); setSp({}); void reload(); } catch (x: any) { setErr(x.message); }
  };

  return (
    <div>
      <h1>Conversations</h1>
      <div className="split">
        <div className="split-list">
          <div className="filters">
            <input className="search" placeholder="Search serial, phone, name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="">All states</option>{['awaiting_image', 'awaiting_serial_confirmation', 'awaiting_assembly', 'recommendation', 'awaiting_lead', 'human_review', 'closed'].map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          {error && <Alert>{error}</Alert>}
          <ul className="conv-list">
            {data?.items.map((c) => (
              <li key={c.id}>
                <button className={sel === c.id ? 'active' : ''} onClick={() => { setSel(c.id); setSp({ open: c.id }); }}>
                  <strong>{c.waId}</strong> {c.profileName && <small>({c.profileName})</small>}<br />
                  <Badge tone={stateTone(c.state)}>{c.state}</Badge> <small>{c.confirmedSerial ?? c.candidateSerial ?? ''}</small><br />
                  <small className="muted">{fmtDate(c.updatedAt)} · {c.channel}</small>
                </button>
              </li>
            ))}
            {data?.items.length === 0 && <li className="muted">No conversations.</li>}
          </ul>
          {data && <Pager page={page} pages={data.pages} total={data.total} onPage={setPage} />}
        </div>

        <div className="split-detail">
          {!sel && <p className="muted">Select a conversation to see the full history, OCR results and delivery status.</p>}
          {err && <Alert>{err}</Alert>}
          {detail && (
            <>
              <div className="card">
                <div className="page-head">
                  <div>
                    <h3>{detail.conversation.waId} <Badge tone={stateTone(detail.conversation.state)}>{detail.conversation.state}</Badge></h3>
                    <small className="muted">Serial: {detail.conversation.confirmedSerial ?? detail.conversation.candidateSerial ?? '—'} · Assembly: {detail.conversation.assemblyCode ?? '—'} · SKU: {detail.conversation.suggestedSku ?? '—'} · Lang: {detail.conversation.language}</small>
                  </div>
                  {isAdmin && <button className="btn danger" onClick={del}>Delete data</button>}
                </div>
                <details><summary>State history</summary><ol>{detail.conversation.stateHistory.map((h: any, i: number) => <li key={i}>{h.state} <small className="muted">({h.reason}) {fmtDate(h.at)}</small></li>)}</ol></details>
                {detail.tickets.length > 0 && <p>Tickets: {detail.tickets.map((t: any) => <Badge key={t._id} tone={t.status === 'open' ? 'red' : 'green'}>{t.ref} · {t.reason}</Badge>)}</p>}
                {detail.leads.length > 0 && <p>Leads: {detail.leads.map((l: any) => <Badge key={l._id} tone="blue">{l.ref}</Badge>)}</p>}
              </div>

              <div className="timeline">
                {detail.messages.map((m: any) => (
                  <div key={m.id} className={`tl ${m.direction}`}>
                    <div className="tl-head"><b>{m.direction === 'in' ? 'Customer' : m.sender === 'staff' ? 'Staff' : 'Bot'}</b> · {fmtDate(m.createdAt)}{m.delivery && m.direction === 'out' && <> · <Badge tone={m.delivery.status === 'failed' ? 'red' : 'grey'}>{m.delivery.status}</Badge>{m.delivery.attempts > 1 && <small> ({m.delivery.attempts} attempts)</small>}{m.delivery.error && <small className="err"> {m.delivery.error}</small>}</>}</div>
                    {m.media && (m.media.available ? <PlatePhoto id={m.id} /> : <small className="muted">📷 photo deleted/expired (hash {String(m.media.sha256).slice(0, 12)}…)</small>)}
                    {m.text && <div className="tl-text">{m.text}</div>}
                    {m.payload?.buttons && <small className="muted">buttons: {m.payload.buttons.map((b: any) => b.title).join(' | ')}</small>}
                    {m.payload?.rows && <small className="muted">list: {m.payload.rows.map((b: any) => b.title).join(' | ')}</small>}
                    {m.ocr?.provider && (
                      <div className="ocr">
                        <b>OCR</b> ({m.ocr.provider}) outcome: <Badge tone={m.ocr.outcome?.startsWith('unreadable') ? 'red' : m.ocr.outcome === 'confirm' ? 'green' : 'amber'}>{m.ocr.outcome}</Badge> · confidence {Math.round(m.ocr.confidence)} · candidates: {m.ocr.candidates?.join(', ') || 'none'} · {m.ocr.durationMs} ms
                        <br /><small className="muted">image sha256 {String(m.ocr.imageHash).slice(0, 16)}…</small>
                        <details><summary>Raw OCR text</summary><pre>{m.ocr.rawText}</pre></details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form className="reply" onSubmit={send}>
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the customer as staff…" maxLength={1000} aria-label="Staff reply" />
                <button className="btn primary" disabled={!reply.trim()}>Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
