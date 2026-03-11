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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Physician Directory</h2>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Physician'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>New Physician</h3>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label>NPI (10 digits)</label>
                  <input className="form-input" value={newDoc.npi} onChange={(e) => setNewDoc({ ...newDoc, npi: e.target.value })} required maxLength={10} />
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
                  <input className="form-input" value={newDoc.fax_number} onChange={(e) => setNewDoc({ ...newDoc, fax_number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-input" type="email" value={newDoc.email} onChange={(e) => setNewDoc({ ...newDoc, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Practice Name</label>
                  <input className="form-input" value={newDoc.practice_name} onChange={(e) => setNewDoc({ ...newDoc, practice_name: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Add Physician</button>
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
            />
          </div>

          {loading ? (
            <p style={{ color: 'var(--color-gray-500)' }}>Loading...</p>
          ) : physicians.length === 0 ? (
            <p style={{ color: 'var(--color-gray-500)' }}>No physicians found.</p>
          ) : (
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
                      <td>{p.last_name}, {p.first_name}</td>
                      <td>{p.npi}</td>
                      <td>{p.fax_number || '—'}</td>
                      <td>{p.email || '—'}</td>
                      <td>{p.practice_name || '—'}</td>
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
