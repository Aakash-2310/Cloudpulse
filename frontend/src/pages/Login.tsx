import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Sparkles } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { PageLoader } from '../components/LoadingSpinner';

const DEMO = { email: 'admin@cloudpulse.com', password: 'Admin@123' };

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email, password, remember });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Sign in to CloudPulse</h1>
      <p className="auth-sub">Monitor every cloud from one console.</p>
      {error && (
        <div className="callout error mb-16" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </div>
        <div className="field">
          <div className="row-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link to="/forgot-password" className="small">
              Forgot password?
            </Link>
          </div>
          <div className="input-group">
            <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="icon-btn ghost sm input-addon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in
          </label>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ height: 40 }}>
          <LogIn size={16} /> {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="demo-box">
        <div className="demo-box-head">
          <span className="row">
            <Sparkles size={14} /> Demo environment
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
            }}
          >
            Use demo account
          </button>
        </div>
        <div className="mono">{DEMO.email} · {DEMO.password}</div>
        <div className="xs muted" style={{ marginTop: 4 }}>
          Demo-only credentials seeded with sample data. Change or remove them for any shared deployment.
        </div>
      </div>
      <p className="auth-alt">
        New to CloudPulse? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
