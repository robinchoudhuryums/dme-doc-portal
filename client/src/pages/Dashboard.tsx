import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import { FormSubmission, DashboardStats, FormStatus, FORM_TYPE_LABELS, STATUS_LABELS, statusBadgeClass } from '../types';
import { format } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [forms, setForms] = useState<FormSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/forms/stats').then((res) => setStats(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, per_page: 25 };
    if (statusFilter) params.status = statusFilter;

    api.get('/forms', { params })
      .then((res) => {
        setForms(res.data.data);
        setTotal(res.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  return (
    <>
      <Header />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Dashboard</h2>
            <p className="page-subtitle">Manage and track CMN form submissions</p>
          </div>
          <Link to="/forms/new" className="btn btn-primary">+ New Form</Link>
        </div>

        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon icon-pending">&#9203;</div>
              <div className="stat-value">{stats.pending_signature + stats.viewed}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon icon-signed">&#10003;</div>
              <div className="stat-value" style={{ color: 'var(--color-success)' }}>{stats.signed}</div>
              <div className="stat-label">Signed</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon icon-expired">&#8987;</div>
              <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{stats.expired}</div>
              <div className="stat-label">Expired</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon icon-total">&#9776;</div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Forms</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Forms</h3>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '150px' }}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All statuses</option>
              {Object.values(FormStatus).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="empty-state">
              <p style={{ animation: 'pulse 1.5s ease infinite' }}>Loading forms...</p>
            </div>
          ) : forms.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#128203;</div>
              <p>No forms found. Create your first CMN form to get started.</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Form Type</th>
                      <th>Patient</th>
                      <th>Physician</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link to={`/forms/${f.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {FORM_TYPE_LABELS[f.form_type] || f.form_type}
                          </Link>
                        </td>
                        <td>{f.patient_name || '—'}</td>
                        <td>{f.physician_name || '—'}</td>
                        <td><span className={statusBadgeClass(f.status)}>{STATUS_LABELS[f.status]}</span></td>
                        <td>{format(new Date(f.created_at), 'MMM d, yyyy')}</td>
                        <td>{format(new Date(f.expires_at), 'MMM d, yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > 25 && (
                <div className="pagination">
                  <button className="btn btn-outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </button>
                  <span className="pagination-info">
                    Page {page} of {Math.ceil(total / 25)}
                  </span>
                  <button className="btn btn-outline" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 25)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
