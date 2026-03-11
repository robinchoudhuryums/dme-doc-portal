import { useState, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import { FormType, DeliveryMethod, FORM_TYPE_LABELS } from '../types';

export default function NewForm() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [formType, setFormType] = useState<FormType>(FormType.CMS_484);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(DeliveryMethod.FAX);
  const [physicianId, setPhysicianId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Search state
  const [physicianQuery, setPhysicianQuery] = useState('');
  const [physicianResults, setPhysicianResults] = useState<Array<{ id: string; first_name: string; last_name: string; npi: string }>>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ signing_url: string; pin: string } | null>(null);

  const searchPhysicians = async (q: string) => {
    setPhysicianQuery(q);
    if (q.length < 2) { setPhysicianResults([]); return; }
    try {
      const res = await api.get('/physicians', { params: { q } });
      setPhysicianResults(res.data.data || []);
    } catch { /* ignore */ }
  };

  const searchPatients = async (q: string) => {
    setPatientQuery(q);
    if (q.length < 2) { setPatientResults([]); return; }
    try {
      const res = await api.get('/patients', { params: { q } });
      setPatientResults(res.data.data || []);
    } catch { /* ignore */ }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!physicianId || !patientId || !pdfFile) {
      setError('Please fill in all required fields and upload a PDF');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('form_type', formType);
      formData.append('delivery_method', deliveryMethod);
      formData.append('physician_id', physicianId);
      formData.append('patient_id', patientId);

      const res = await api.post('/forms', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult({ signing_url: res.data.signing_url, pin: res.data.pin });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create form';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <>
        <Header />
        <div className="page-content">
          <div className="card" style={{ maxWidth: '560px', margin: '0 auto' }}>
            <div className="success-card">
              <div className="success-card-icon">&#10003;</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Form Created Successfully</h2>
              <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                The signing link has been sent to the physician.
              </p>
            </div>

            <div className="form-group">
              <label>Signing URL</label>
              <input className="form-input" readOnly value={result.signing_url} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div className="form-group">
              <label>PIN (communicate separately to physician)</label>
              <input className="form-input pin-input" readOnly value={result.pin} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div className="warning-message" style={{ fontSize: '0.8125rem' }}>
              <strong>Security:</strong> Send the PIN via a separate channel (phone, separate email) from the signing link.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
              <button className="btn btn-outline" onClick={() => { setResult(null); setPhysicianId(''); setPatientId(''); setPhysicianQuery(''); setPatientQuery(''); setPdfFile(null); }}>
                Create Another
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-content">
        <div className="card" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 className="page-title" style={{ fontSize: '1.25rem' }}>New CMN Form</h2>
            <p className="page-subtitle">Fill in the details to create and send a form for physician signature.</p>
          </div>
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Form Type</label>
              <select className="form-select" value={formType} onChange={(e) => setFormType(e.target.value as FormType)}>
                {Object.entries(FORM_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Delivery Method</label>
              <select className="form-select" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}>
                <option value="fax">Fax</option>
                <option value="email">Email</option>
                <option value="both">Both (Fax + Email)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Physician</label>
              <input
                className="form-input"
                placeholder="Search by name or NPI..."
                value={physicianQuery}
                onChange={(e) => searchPhysicians(e.target.value)}
              />
              {physicianResults.length > 0 && !physicianId && (
                <div className="autocomplete-dropdown">
                  {physicianResults.map((p) => (
                    <div
                      key={p.id}
                      className="autocomplete-item"
                      onClick={() => { setPhysicianId(p.id); setPhysicianQuery(`${p.last_name}, ${p.first_name} (NPI: ${p.npi})`); setPhysicianResults([]); }}
                    >
                      <strong>{p.last_name}, {p.first_name}</strong>
                      <span style={{ color: 'var(--color-gray-400)', marginLeft: '0.5rem' }}>NPI: {p.npi}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Patient</label>
              <input
                className="form-input"
                placeholder="Search by name or Medicare ID..."
                value={patientQuery}
                onChange={(e) => searchPatients(e.target.value)}
              />
              {patientResults.length > 0 && !patientId && (
                <div className="autocomplete-dropdown">
                  {patientResults.map((p) => (
                    <div
                      key={p.id}
                      className="autocomplete-item"
                      onClick={() => { setPatientId(p.id); setPatientQuery(`${p.last_name}, ${p.first_name}`); setPatientResults([]); }}
                    >
                      {p.last_name}, {p.first_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Pre-filled CMN PDF (Section A completed)</label>
              <div
                className={`file-upload ${pdfFile ? 'has-file' : ''}`}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                />
                {pdfFile ? (
                  <>
                    <div className="file-upload-icon">&#128196;</div>
                    <div className="file-upload-text"><strong>{pdfFile.name}</strong></div>
                    <div className="file-upload-text">{(pdfFile.size / 1024).toFixed(0)} KB</div>
                  </>
                ) : (
                  <>
                    <div className="file-upload-icon">&#128194;</div>
                    <div className="file-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                    <div className="file-upload-text">PDF files only, up to 20 MB</div>
                  </>
                )}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Creating...' : 'Create & Send to Physician'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
