import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import { FormSubmission, FormStatus, FORM_TYPE_LABELS, STATUS_LABELS, statusBadgeClass } from '../types';
import { format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  action: string;
  actor_type: string;
  ip_address: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

export default function FormDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormSubmission | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/forms/${id}`)
      .then((res) => {
        setForm(res.data.submission);
        setAuditLogs(res.data.audit_logs || []);
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleCancel = async () => {
    if (!form || !window.confirm('Are you sure you want to cancel this form?')) return;
    setCancelling(true);
    try {
      await api.post(`/forms/${form.id}/cancel`);
      setForm({ ...form, status: FormStatus.CANCELLED });
    } catch { /* ignore */ }
    setCancelling(false);
  };

  if (loading) return <><Header /><div className="loading">Loading...</div></>;
  if (!form) return <><Header /><div className="page-content"><p>Form not found</p></div></>;

  return (
    <>
      <Header />
      <div className="page-content">
        <button className="btn btn-outline" onClick={() => navigate('/dashboard')} style={{ marginBottom: '1rem' }}>
          &larr; Back to Dashboard
        </button>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {FORM_TYPE_LABELS[form.form_type] || form.form_type}
              </h2>
              <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>
                ID: {form.id}
              </p>
            </div>
            <span className={statusBadgeClass(form.status)}>{STATUS_LABELS[form.status]}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Created</div>
              <div>{format(new Date(form.created_at), 'MMM d, yyyy h:mm a')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Expires</div>
              <div>{format(new Date(form.expires_at), 'MMM d, yyyy')}</div>
            </div>
            {form.signed_at && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Signed At</div>
                <div>{format(new Date(form.signed_at), 'MMM d, yyyy h:mm a')}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Reminders Sent</div>
              <div>{form.reminder_count}</div>
            </div>
          </div>

          {form.status !== FormStatus.SIGNED && form.status !== FormStatus.CANCELLED && (
            <div style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Cancel Form'}
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Audit Trail</h3>
          {auditLogs.length === 0 ? (
            <p style={{ color: 'var(--color-gray-500)' }}>No audit entries.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{format(new Date(log.created_at), 'MMM d, yyyy h:mm:ss a')}</td>
                      <td>{log.action.replace(/_/g, ' ')}</td>
                      <td>{log.actor_type}</td>
                      <td>{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
