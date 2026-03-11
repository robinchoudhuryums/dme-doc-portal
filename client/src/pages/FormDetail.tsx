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
        <button className="btn btn-outline" onClick={() => navigate('/dashboard')} style={{ marginBottom: '1.25rem' }}>
          &larr; Back to Dashboard
        </button>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: '1.25rem' }}>
                {FORM_TYPE_LABELS[form.form_type] || form.form_type}
              </h2>
              <p style={{ color: 'var(--color-gray-400)', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                {form.id}
              </p>
            </div>
            <span className={statusBadgeClass(form.status)}>{STATUS_LABELS[form.status]}</span>
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <div className="meta-label">Created</div>
              <div className="meta-value">{format(new Date(form.created_at), 'MMM d, yyyy h:mm a')}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Expires</div>
              <div className="meta-value">{format(new Date(form.expires_at), 'MMM d, yyyy')}</div>
            </div>
            {form.signed_at && (
              <div className="meta-item">
                <div className="meta-label">Signed At</div>
                <div className="meta-value" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  {format(new Date(form.signed_at), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            )}
            <div className="meta-item">
              <div className="meta-label">Reminders Sent</div>
              <div className="meta-value">{form.reminder_count}</div>
            </div>
          </div>

          {form.status !== FormStatus.SIGNED && form.status !== FormStatus.CANCELLED && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-gray-100)' }}>
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Cancel Form'}
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Audit Trail</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>
              {auditLogs.length} event{auditLogs.length !== 1 ? 's' : ''}
            </span>
          </div>
          {auditLogs.length === 0 ? (
            <div className="empty-state">
              <p>No audit entries recorded yet.</p>
            </div>
          ) : (
            <div className="audit-timeline">
              {auditLogs.map((log) => (
                <div className="audit-entry" key={log.id}>
                  <div className="audit-action">
                    {log.action.replace(/_/g, ' ')}
                  </div>
                  <div className="audit-meta">
                    <span>{format(new Date(log.created_at), 'MMM d, yyyy h:mm:ss a')}</span>
                    <span>{log.actor_type}</span>
                    {log.ip_address && <span>{log.ip_address}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
