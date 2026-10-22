import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
import { authService } from '../services/authService';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Link to="/login" className="row small" style={{ marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to sign in
      </Link>
      <h1 className="auth-title">Reset your password</h1>
      <p className="auth-sub">Enter the email you use for CloudPulse and we’ll send a reset link.</p>
      {sent ? (
        <div className="callout success" role="status">
          <MailCheck size={18} />
          <div>
            <div className="bold">Check your inbox</div>
            If an account exists for <b>{email}</b>, a reset link valid for 30 minutes is on its way. In this demo build there is no mail
            server — the link is written to the API server log.
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && (
            <div className="callout error mb-16" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ height: 40 }}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
