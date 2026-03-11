import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import axios from 'axios';

export default function SigningForm() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const sigRef = useRef<SignatureCanvas | null>(null);

  const [sessionToken] = useState(() => sessionStorage.getItem('physician_session'));
  const [formType] = useState(() => sessionStorage.getItem('form_type') || '');
  const [sectionBData, setSectionBData] = useState<Record<string, string>>(() => {
    const saved = sessionStorage.getItem('section_b_data');
    return saved ? JSON.parse(saved) : {};
  });

  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState('');

  // Redirect if no session
  useEffect(() => {
    if (!sessionToken) navigate(`/sign/${token}`);
  }, [sessionToken, navigate, token]);

  // HIPAA: session timeout (15 min)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sessionStorage.clear();
        navigate(`/sign/${token}`);
      }, 15 * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timeout);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [navigate, token]);

  const authHeaders = { Authorization: `Bearer ${sessionToken}` };

  const handleFieldChange = (field: string, value: string) => {
    setSectionBData((prev) => ({ ...prev, [field]: value }));
  };

  const saveSectionB = async () => {
    setSaving(true);
    setError('');
    try {
      await axios.post(`/api/sign/${token}/section-b`, { section_b_data: sectionBData }, { headers: authHeaders });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save';
      setError(message);
    }
    setSaving(false);
  };

  const handleSign = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError('Please provide your signature');
      return;
    }

    setSigning(true);
    setError('');
    try {
      // Save section B first
      await axios.post(`/api/sign/${token}/section-b`, { section_b_data: sectionBData }, { headers: authHeaders });

      // Then submit signature
      const signatureData = sigRef.current.toDataURL('image/png');
      await axios.post(`/api/sign/${token}/sign`, { signature_data: signatureData }, { headers: authHeaders });
      setSigned(true);
      sessionStorage.clear();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Signing failed';
      setError(message);
    }
    setSigning(false);
  };

  if (signed) {
    return (
      <div className="signing-container">
        <div className="signing-header">
          <h1>Universal Medical Supply</h1>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="success-message" style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
            Document signed successfully!
          </div>
          <p style={{ color: 'var(--color-gray-500)' }}>
            Thank you. Universal Medical Supply has been notified and will process the signed document.
            You may close this window.
          </p>
        </div>
      </div>
    );
  }

  // Build Section B fields based on form type
  const sectionBFields = getSectionBFields(formType);

  return (
    <div className="signing-container">
      <div className="signing-header">
        <h1>Universal Medical Supply</h1>
        <p>Complete & Sign Document</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Section B Form */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Section B — Clinical Information
        </h3>
        <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Please answer the following clinical questions.
        </p>

        {sectionBFields.map((field) => (
          <div className="form-group" key={field.key}>
            <label>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                className="form-input"
                rows={3}
                value={sectionBData[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                className="form-select"
                value={sectionBData[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              >
                <option value="">Select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type || 'text'}
                className="form-input"
                value={sectionBData[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
            )}
          </div>
        ))}

        <button className="btn btn-outline" onClick={saveSectionB} disabled={saving} style={{ marginTop: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
      </div>

      {/* Signature Pad */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Section D — Physician Signature
        </h3>
        <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          By signing below, I certify that the above information is true, accurate, and complete to the best of my knowledge.
        </p>

        <div className="signature-pad">
          <SignatureCanvas
            ref={sigRef}
            canvasProps={{
              style: { width: '100%', height: '200px' },
            }}
            backgroundColor="#ffffff"
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button className="btn btn-outline" onClick={() => sigRef.current?.clear()}>
            Clear Signature
          </button>
          <button className="btn btn-primary" onClick={handleSign} disabled={signing} style={{ flex: 1 }}>
            {signing ? 'Signing...' : 'Sign & Submit'}
          </button>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '1rem' }}>
          This electronic signature is legally binding under the E-SIGN Act and UETA.
          Your IP address and timestamp will be recorded as part of the audit trail.
        </p>
      </div>
    </div>
  );
}

// Section B field definitions per form type
interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date' | 'number';
  options?: string[];
}

function getSectionBFields(formType: string): FieldDef[] {
  switch (formType) {
    case 'CMS-484':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text' },
        { key: 'o2_test_date', label: 'Date of most recent arterial blood gas or oximetry test', type: 'date' },
        { key: 'o2_test_result', label: 'Test result (PaO2 or SpO2 value)', type: 'text' },
        { key: 'o2_test_condition', label: 'Condition during test', type: 'select', options: ['At rest', 'During exercise', 'During sleep'] },
        { key: 'lpm_prescribed', label: 'Liters per minute prescribed', type: 'number' },
        { key: 'o2_frequency', label: 'Frequency of use', type: 'select', options: ['Continuous', 'During sleep only', 'During exercise only', 'PRN'] },
        { key: 'portable_needed', label: 'Is portable oxygen needed?', type: 'select', options: ['Yes', 'No'] },
        { key: 'clinical_notes', label: 'Additional clinical notes', type: 'textarea' },
      ];
    case 'CMS-10126':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text' },
        { key: 'mobility_limitation', label: 'Describe mobility limitation requiring hospital bed', type: 'textarea' },
        { key: 'bed_type', label: 'Type of bed needed', type: 'select', options: ['Fixed height', 'Variable height', 'Semi-electric', 'Total electric'] },
        { key: 'side_rails', label: 'Side rails needed?', type: 'select', options: ['Yes', 'No'] },
        { key: 'mattress_type', label: 'Mattress type', type: 'select', options: ['Standard', 'Pressure reduction', 'Alternating pressure', 'Low air loss'] },
        { key: 'clinical_justification', label: 'Clinical justification for medical necessity', type: 'textarea' },
      ];
    case 'CMS-10125':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text' },
        { key: 'mobility_limitation', label: 'Describe mobility limitation in the home', type: 'textarea' },
        { key: 'manual_wheelchair_insufficient', label: 'Why is a manual wheelchair insufficient?', type: 'textarea' },
        { key: 'can_operate_pov', label: 'Can patient safely operate a POV/power wheelchair?', type: 'select', options: ['Yes', 'No'] },
        { key: 'home_assessment', label: 'Has a home assessment been completed?', type: 'select', options: ['Yes', 'No'] },
        { key: 'clinical_justification', label: 'Clinical justification for power mobility', type: 'textarea' },
      ];
    default: // PRIOR-AUTH or generic
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text' },
        { key: 'equipment_description', label: 'Equipment/supply being requested', type: 'text' },
        { key: 'medical_necessity', label: 'Medical necessity / clinical justification', type: 'textarea' },
        { key: 'duration', label: 'Expected duration of need', type: 'text' },
        { key: 'alternatives_tried', label: 'Alternative treatments tried', type: 'textarea' },
        { key: 'additional_notes', label: 'Additional notes', type: 'textarea' },
      ];
  }
}
