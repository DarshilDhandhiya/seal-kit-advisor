import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = 'grey', children }: { tone?: 'green' | 'red' | 'amber' | 'blue' | 'grey'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export const stateTone = (s: string) =>
  ({ awaiting_image: 'grey', awaiting_serial_confirmation: 'blue', awaiting_assembly: 'blue', recommendation: 'green', awaiting_lead: 'amber', human_review: 'red', closed: 'grey' })[s] as any;

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="pager">
      <span>{total} record(s)</span>
      <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <span>
        Page {page} / {pages}
      </span>
      <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

/** Paged list loader with filters and refresh. */
export function useList<T>(path: string, params: Record<string, string | number | undefined>, deps: unknown[] = []) {
  const [data, setData] = useState<Paged<T> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const seq = useRef(0);
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), limit: '25' });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
    try {
      const d = await api<Paged<T>>(`${path}?${p}`);
      if (my === seq.current) {
        setData(d);
        setError('');
      }
    } catch (e: any) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, page, key, ...deps]);

  useEffect(() => {
    setPage(1);
  }, [key]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, page, setPage, reload: load };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
