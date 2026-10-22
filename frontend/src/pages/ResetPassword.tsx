import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { authService } from '../services/authService';
import { passwordIssues } from './Register';
import { useToast } from '../hooks/usePreferences';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issues = passwordIssues(password);
    if (issues.length) return setError(`Password needs ${issues.join(', ')}.`);
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword(token, password);
      toast.success('Password updated', 'Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-sub">Reset links expire 30 minutes after they are requested.</p>
      {!token ? (
        <div className="callout error">
          This reset link is missing its token. <Link to="/forgot-password">Request a new link</Link>.
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && (
            <div className="callout error mb-16" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="pw">
              New password
            </label>
            <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
          </div>
          <div className="field">
            <label className="label" htmlFor="pw2">
              Confirm password
            </label>
            <input id="pw2" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ height: 40 }}>
            {submitting ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
