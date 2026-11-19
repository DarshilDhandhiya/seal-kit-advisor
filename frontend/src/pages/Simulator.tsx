import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, api, assetUrl } from '../api';
import { stateTone, Badge } from '../components/ui';

interface ChatMsg {
  id: string;
  direction: 'in' | 'out';
  sender: string;
  type: string;
  text: string;
  payload: any;
  hasImage: boolean;
  delivery?: string | null;
  createdAt: string;
}
interface Conv {
  id: string;
  waId: string;
  state: string;
  language: string;
  confirmedSerial: string | null;
  candidateSerial: string | null;
  assemblyCode: string | null;
  suggestedSku: string | null;
}
interface Plate {
  file: string;
  url: string;
  expectedSerial: string | null;
  expected: string;
}
interface Pending {
  tmp: string;
  text: string;
  thumb?: string;
}

const newWaId = () => 'sim-' + Math.random().toString(36).slice(2, 10);
const getWaId = () => {
  let v = localStorage.getItem('sealkit.waId');
  if (!v || !/^sim-[a-z0-9]{6,32}$/.test(v)) {
    v = newWaId();
    localStorage.setItem('sealkit.waId', v);
  }
  return v;
};

/** WhatsApp-style *bold* + line breaks */
function fmt(text: string): ReactNode {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? (
      <strong key={i}>{part.slice(1, -1)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const QUICK = [
  { label: 'Typed serial', text: 'DEMO-BHL-0001' },
  { label: 'Sloppy typed serial', text: 'demo bhl 0003' },
  { label: 'Unknown serial', text: 'DEMO-UNKNOWN-9999' },
  { label: 'Out-of-stock machine', text: 'DEMO-BHL-0002' },
  { label: 'No-fitment machine (EXC-0008)', text: 'DEMO-EXC-0008' },
  { label: 'Talk to human', text: 'human' },
  { label: 'Start over', text: 'reset' },
  { label: 'हिन्दी में बात करें', text: 'हिन्दी' },
  { label: 'Switch to English', text: 'english' },
];

export default function Simulator() {
  const [waId, setWaId] = useState(getWaId);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conv, setConv] = useState<Conv | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [plates, setPlates] = useState<Plate[]>([]);
  const [listFor, setListFor] = useState<ChatMsg | null>(null);
  const [tab, setTab] = useState<'plates' | 'quick' | 'session'>('plates');
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ conversation: Conv | null; messages: ChatMsg[] }>(`/api/demo/conversations/${waId}`, { public: true });
      setMessages(d.messages);
      setConv(d.conversation);
    } catch (e: any) {
      setError(e.message);
    }
  }, [waId]);

  useEffect(() => {
    setMessages([]);
    setConv(null);
    void refresh();
    const t = setInterval(refresh, 4000); // picks up staff replies sent from the operator console
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    api<{ plates: Plate[] }>('/api/demo/plates', { public: true })
      .then((d) => setPlates(d.plates))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending.length, busy]);

  const send = async (o: { text?: string; buttonId?: string; file?: File; label?: string }) => {
    if (busy) return;
    setError('');
    setBusy(true);
    const tmp = 'tmp-' + Date.now();
    const thumb = o.file ? URL.createObjectURL(o.file) : undefined;
    setPending((p) => [...p, { tmp, text: o.label ?? o.text ?? '', thumb }]);
    try {
      const form = new FormData();
      form.set('waId', waId);
      if (o.text) form.set('text', o.text);
      if (o.buttonId) form.set('buttonId', o.buttonId);
      if (o.label && o.buttonId) form.set('text', o.label);
      if (o.file) form.set('image', o.file, o.file.name);
      const r = await api<{ inboundId: string }>('/api/demo/messages', { method: 'POST', form, public: true });
      if (thumb && r.inboundId) setThumbs((t) => ({ ...t, [r.inboundId]: thumb }));
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending((p) => p.filter((x) => x.tmp !== tmp));
      setBusy(false);
    }
  };

  const sendPlate = async (p: Plate) => {
    try {
      const blob = await (await fetch(assetUrl(p.url))).blob();
      await send({ file: new File([blob], p.file, { type: blob.type || 'image/png' }), label: `📷 ${p.file}` });
    } catch (e: any) {
      setError(`Could not load sample plate: ${e.message}`);
    }
  };

  const newCustomer = () => {
    const id = newWaId();
    localStorage.setItem('sealkit.waId', id);
    setWaId(id);
    setThumbs({});
  };

  const last = messages[messages.length - 1];
  const activeId = last?.direction === 'out' ? last.id : null;

  const renderOut = (m: ChatMsg) => {
    const p = m.payload;
    const active = m.id === activeId && !busy;
    if (!p || p.kind === 'text') return <div className="bubble out">{fmt(m.text)}</div>;
    if (p.kind === 'image') return <div className="bubble out"><img className="bubble-img" src={assetUrl(p.url)} alt="" />{p.caption && <div>{fmt(p.caption)}</div>}</div>;
    return (
      <div className="bubble out">
        {p.headerImage && <img className="bubble-img" src={assetUrl(p.headerImage)} alt="Kit illustration (demo placeholder)" />}
        <div>{fmt(p.text)}</div>
        {p.kind === 'buttons' && (
          <div className="wa-actions">
            {p.buttons.map((b: any) => (
              <button key={b.id} className="wa-btn" disabled={!active} onClick={() => send({ buttonId: b.id, label: b.title })}>
                {b.title}
              </button>
            ))}
          </div>
        )}
        {p.kind === 'list' && (
          <div className="wa-actions">
            <button className="wa-btn" disabled={!active} onClick={() => setListFor(m)}>
              ☰ {p.buttonLabel}
            </button>
          </div>
        )}
      </div>
    );
  };

  const stateLabel = useMemo(() => conv?.state?.replace(/_/g, ' ') ?? 'new conversation', [conv]);

  return (
    <div className="sim-page">
      <header className="sim-top">
        <div>
          <h1>Seal-Kit Advisor <span className="demo-pill">DEMO</span></h1>
          <p>WhatsApp conversation simulator — runs the same backend workflow as the real WhatsApp webhook.</p>
        </div>
        <nav>
          <Link className="btn" to="/admin">Operator console →</Link>
        </nav>
      </header>
      <div className="banner">⚠️ All machine serials, kits, prices and fitments are <b>fictional demo data</b> — not verified JCB compatibility.</div>

      <div className="sim-grid">
        <section className="phone" aria-label="Chat simulator">
          <div className="phone-head">
            <div className="avatar">SK</div>
            <div>
              <strong>Seal-Kit Advisor</strong>
              <small>{busy ? 'typing…' : `customer ${waId}`}</small>
            </div>
            <Badge tone={stateTone(conv?.state ?? 'awaiting_image')}>{stateLabel}</Badge>
          </div>
          <div className="chat" aria-live="polite">
            {messages.length === 0 && pending.length === 0 && (
              <div className="empty-chat">Say “hi”, send a sample plate photo, or type a serial like <code>DEMO-BHL-0001</code>.</div>
            )}
            {messages.map((m) =>
              m.direction === 'in' ? (
                <div key={m.id} className="row in">
                  <div className="bubble in">
                    {(m.hasImage || thumbs[m.id]) && (thumbs[m.id] ? <img className="bubble-img" src={thumbs[m.id]} alt="Uploaded plate" /> : <div className="muted">📷 photo (not kept in browser)</div>)}
                    {m.text && <div>{m.text}</div>}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="row out">
                  {m.sender === 'staff' && <small className="staff-tag">Staff</small>}
                  {renderOut(m)}
                </div>
              ),
            )}
            {pending.map((p) => (
              <div key={p.tmp} className="row in">
                <div className="bubble in pending">
                  {p.thumb && <img className="bubble-img" src={p.thumb} alt="" />}
                  {p.text && <div>{p.text}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="row out"><div className="bubble out typing"><span /><span /><span /></div></div>}
            <div ref={endRef} />
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              const t = text.trim();
              if (!t) return;
              setText('');
              void send({ text: t });
            }}
          >
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void send({ file: f, label: `📷 ${f.name}` }); e.target.value = ''; }} />
            <button type="button" className="icon-btn" title="Attach plate photo" aria-label="Attach plate photo" onClick={() => fileRef.current?.click()} disabled={busy}>📎</button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message or serial number…" aria-label="Message" maxLength={500} />
            <button className="send-btn" disabled={busy || !text.trim()} aria-label="Send">➤</button>
          </form>
        </section>

        <aside className="side">
          <div className="tabs" role="tablist">
            {(['plates', 'quick', 'session'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {{ plates: 'Sample plates', quick: 'Quick messages', session: 'Session' }[t]}
              </button>
            ))}
          </div>
          {tab === 'plates' && (
            <div>
              <p className="muted">Click a plate to “send” it as a photo (fictional OCR test images).</p>
              <div className="plate-grid">
                {plates.map((p) => (
                  <button key={p.file} className="plate" disabled={busy} onClick={() => sendPlate(p)} title={p.expected}>
                    <img src={assetUrl(p.url)} alt={p.file} loading="lazy" />
                    <span>{p.file.replace('.png', '')}</span>
                    <small>{p.expectedSerial ?? 'no serial readable'}</small>
                  </button>
                ))}
                {!plates.length && <p className="muted">No plates found (is the backend running?)</p>}
              </div>
            </div>
          )}
          {tab === 'quick' && (
            <div className="quick">
              {QUICK.map((q) => (
                <button key={q.label} className="btn" disabled={busy} onClick={() => send({ text: q.text })}>
                  {q.label} <code>{q.text}</code>
                </button>
              ))}
            </div>
          )}
          {tab === 'session' && (
            <div>
              <dl className="kv">
                <dt>Customer id</dt><dd><code>{waId}</code></dd>
                <dt>State</dt><dd>{conv ? <Badge tone={stateTone(conv.state)}>{conv.state}</Badge> : '—'}</dd>
                <dt>Language</dt><dd>{conv?.language ?? 'en'}</dd>
                <dt>Candidate serial</dt><dd>{conv?.candidateSerial ?? '—'}</dd>
                <dt>Confirmed serial</dt><dd>{conv?.confirmedSerial ?? '—'}</dd>
                <dt>Assembly</dt><dd>{conv?.assemblyCode ?? '—'}</dd>
                <dt>Suggested SKU</dt><dd>{conv?.suggestedSku ?? '—'}</dd>
              </dl>
              <div className="row-actions">
                <button className="btn" onClick={() => send({ buttonId: 'cmd:reset', label: 'reset' })} disabled={busy}>Reset conversation</button>
                <button className="btn" onClick={newCustomer}>New customer</button>
              </div>
              <p className="muted">State is stored in MongoDB; staff can see this chat (with OCR results) in the operator console and reply to it.</p>
              <p className="muted">API: <code>{API || window.location.origin}</code></p>
            </div>
          )}
        </aside>
      </div>

      {listFor && (
        <div className="sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && setListFor(null)}>
          <div className="sheet" role="dialog" aria-label={listFor.payload.buttonLabel}>
            <h3>{listFor.payload.buttonLabel}</h3>
            {listFor.payload.rows.map((r: any) => (
              <button key={r.id} className="sheet-row" onClick={() => { setListFor(null); void send({ buttonId: r.id, label: r.title }); }}>
                <strong>{r.title}</strong>
                {r.description && <small>{r.description}</small>}
              </button>
            ))}
            <button className="btn" onClick={() => setListFor(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
