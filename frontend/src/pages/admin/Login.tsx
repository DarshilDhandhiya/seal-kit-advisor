import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, auth } from '../../api';
import { Alert } from '../../components/ui';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string; user: any }>('/api/admin/auth/login', { method: 'POST', body: { email, password }, public: true });
      auth.set(r.token, r.user);
      nav('/admin', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Operator console</h1>
        <p className="muted">Seal-Kit Advisor — DEMO (fictional data)</p>
        {error && <Alert>{error}</Alert>}
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Demo credentials are in the README (<code>backend/.env</code>: ADMIN_EMAIL / STAFF_EMAIL).</p>
        <Link to="/">← Back to chat simulator</Link>
      </form>
    </div>
  );
}
