import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) issues.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) issues.push('a number');
  return issues;
}

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address';
    const issues = passwordIssues(form.password);
    if (issues.length) next.password = `Password needs ${issues.join(', ')}`;
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    setError(null);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      }
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-sub">New accounts start with read-only (Viewer) access. An administrator can grant more.</p>
      {error && (
        <div className="callout error mb-16" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input id="name" className={`input ${errors.name ? 'invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" autoFocus />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input id="email" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="email" />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" className={`input ${errors.password ? 'invalid' : ''}`} value={form.password} onChange={set('password')} autoComplete="new-password" />
          {errors.password ? <span className="field-error">{errors.password}</span> : <span className="hint">8+ characters with upper- and lowercase letters and a number.</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm">
            Confirm password
          </label>
          <input id="confirm" type="password" className={`input ${errors.confirm ? 'invalid' : ''}`} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          {errors.confirm && <span className="field-error">{errors.confirm}</span>}
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ height: 40 }}>
          <UserPlus size={16} /> {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
