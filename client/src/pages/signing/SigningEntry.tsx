import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function SigningEntry() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [formInfo, setFormInfo] = useState<{ form_type: string; status: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/sign/${token}`)
      .then((res) => setFormInfo(res.data))
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid or expired link');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError('');
    try {
      const res = await axios.post(`/api/sign/${token}/verify`, { pin });
      // Store session token and navigate to the form
      sessionStorage.setItem('physician_session', res.data.session_token);
      sessionStorage.setItem('form_type', res.data.form_type);
      if (res.data.section_b_data) {
        sessionStorage.setItem('section_b_data', JSON.stringify(res.data.section_b_data));
      }
      if (res.data.context) {
        sessionStorage.setItem('form_context', JSON.stringify(res.data.context));
      }
      navigate(`/sign/${token}/form`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Verification failed';
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="signing-container">
        <div className="signing-header">
          <h1>Universal Medical Supply</h1>
          <p>Secure Document Signing</p>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--color-gray-500)' }}>Loading...</p>
      </div>
    );
  }

  if (!formInfo) {
    return (
      <div className="signing-container">
        <div className="signing-header">
          <h1>Universal Medical Supply</h1>
          <p>Secure Document Signing</p>
        </div>
        <div className="error-message">{error || 'This link is no longer valid.'}</div>
      </div>
    );
  }

  return (
    <div className="signing-container">
      <div className="signing-header">
        <h1>Universal Medical Supply</h1>
        <p>Secure Document Signing</p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Verify Your Identity
        </h2>
        <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Enter the PIN that was provided to your office to access the document.
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleVerify}>
          <div className="form-group">
            <label htmlFor="pin">PIN Code</label>
            <input
              id="pin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="form-input"
              style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.75rem' }}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              autoFocus
              autoComplete="one-time-code"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={verifying || pin.length < 6}>
            {verifying ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2rem' }}>
        This is a secure portal. Your session will expire after 15 minutes of inactivity.
        <br />If you need assistance, contact Universal Medical Supply.
      </p>
    </div>
  );
}
