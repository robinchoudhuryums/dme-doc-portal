import { useState, useEffect, FormEvent } from 'react';
import Header from '../components/Header';
import api from '../services/api';
import { Physician } from '../types';

export default function Physicians() {
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New physician form
  const [newDoc, setNewDoc] = useState({
    npi: '', first_name: '', last_name: '', fax_number: '', email: '', phone: '', practice_name: '',
  });

  const fetchPhysicians = () => {
    setLoading(true);
    const params: Record<string, string | number> = search ? { q: search } : { page };
    api.get('/physicians', { params })
      .then((res) => {
        setPhysicians(res.data.data || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPhysicians(); }, [page, search]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/physicians', newDoc);
      setShowForm(false);
      setNewDoc({ npi: '', first_name: '', last_name: '', fax_number: '', email: '', phone: '', practice_name: '' });
      fetchPhysicians();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add physician';
      setError(message);
    }
  };

  return (
    <>
      <Header />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Physician Directory</h2>
            <p className="page-subtitle">Manage physicians who receive CMN forms for signature</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Physician'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: '1.25rem', animation: 'slideUp 0.2s ease' }}>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>New Physician</h3>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1.25rem' }}>
                <div className="form-group">
                  <label>NPI (10 digits)</label>
                  <input className="form-input" value={newDoc.npi} onChange={(e) => setNewDoc({ ...newDoc, npi: e.target.value })} required maxLength={10} placeholder="1234567890" />
                </div>
                <div className="form-group">
                  <label>First Name</label>
                  <input className="form-input" value={newDoc.first_name} onChange={(e) => setNewDoc({ ...newDoc, first_name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input className="form-input" value={newDoc.last_name} onChange={(e) => setNewDoc({ ...newDoc, last_name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Fax Number</label>
                  <input className="form-input" value={newDoc.fax_number} onChange={(e) => setNewDoc({ ...newDoc, fax_number: e.target.value })} placeholder="+1 (555) 123-4567" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-input" type="email" value={newDoc.email} onChange={(e) => setNewDoc({ ...newDoc, email: e.target.value })} placeholder="doctor@practice.com" />
                </div>
                <div className="form-group">
                  <label>Practice Name</label>
                  <input className="form-input" value={newDoc.practice_name} onChange={(e) => setNewDoc({ ...newDoc, practice_name: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.25rem' }}>Add Physician</button>
            </form>
          </div>
        )}

        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <input
              className="form-input"
              placeholder="Search by name, NPI, or practice..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ maxWidth: '360px' }}
            />
          </div>

          {loading ? (
            <div className="empty-state">
              <p style={{ animation: 'pulse 1.5s ease infinite' }}>Loading physicians...</p>
            </div>
          ) : physicians.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#129658;</div>
              <p>No physicians found. Add your first physician to get started.</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>NPI</th>
                      <th>Fax</th>
                      <th>Email</th>
                      <th>Practice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {physicians.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}>{p.last_name}, {p.first_name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{p.npi}</td>
                        <td>{p.fax_number || <span style={{ color: 'var(--color-gray-300)' }}>—</span>}</td>
                        <td>{p.email || <span style={{ color: 'var(--color-gray-300)' }}>—</span>}</td>
                        <td>{p.practice_name || <span style={{ color: 'var(--color-gray-300)' }}>—</span>}</td>
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
