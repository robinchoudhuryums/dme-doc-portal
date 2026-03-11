import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import axios from 'axios';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FormContext {
  physician: { name: string; npi: string; practice_name: string | null } | null;
  patient: { name: string; date_of_birth: string; medicare_id: string | null; insurance_id: string | null } | null;
}

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date' | 'number';
  options?: string[];
  required?: boolean;
  /** Only show this field when the condition is met */
  showWhen?: { field: string; value: string | string[] };
  /** Hint text shown below the field */
  hint?: string;
}

interface ValidationIssue {
  field: string;
  label: string;
  severity: 'error' | 'warning';
  message: string;
}

const STEPS = ['Review Info', 'Clinical Questions', 'Review & Sign'] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export default function SigningForm() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const sigRef = useRef<SignatureCanvas | null>(null);

  // Session state
  const [sessionToken] = useState(() => sessionStorage.getItem('physician_session'));
  const [formType] = useState(() => sessionStorage.getItem('form_type') || '');
  const [formContext] = useState<FormContext>(() => {
    const saved = sessionStorage.getItem('form_context');
    return saved ? JSON.parse(saved) : { physician: null, patient: null };
  });
  const [sectionBData, setSectionBData] = useState<Record<string, string>>(() => {
    const saved = sessionStorage.getItem('section_b_data');
    return saved ? JSON.parse(saved) : {};
  });

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ─── Conditional field visibility ───────────────────────────────────────

  const sectionBFields = getSectionBFields(formType);

  const isFieldVisible = useCallback(
    (field: FieldDef): boolean => {
      if (!field.showWhen) return true;
      const depValue = sectionBData[field.showWhen.field];
      if (Array.isArray(field.showWhen.value)) {
        return field.showWhen.value.includes(depValue);
      }
      return depValue === field.showWhen.value;
    },
    [sectionBData],
  );

  const visibleFields = sectionBFields.filter(isFieldVisible);

  // ─── Validation ─────────────────────────────────────────────────────────

  const validateFields = useCallback((): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    for (const field of visibleFields) {
      const value = sectionBData[field.key]?.trim();

      // Required field check
      if (field.required && !value) {
        issues.push({
          field: field.key,
          label: field.label,
          severity: 'error',
          message: `${field.label} is required`,
        });
      }
    }

    // Form-type-specific compliance checks
    issues.push(...getComplianceWarnings(formType, sectionBData));

    return issues;
  }, [visibleFields, sectionBData, formType]);

  // ─── Auto-save on step change ───────────────────────────────────────────

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

  // ─── Step navigation ───────────────────────────────────────────────────

  const goToStep = async (step: number) => {
    setError('');

    // Validate before leaving Clinical Questions step
    if (currentStep === 1 && step > 1) {
      const issues = validateFields();
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length > 0) {
        const errs: Record<string, string> = {};
        errors.forEach((e) => {
          errs[e.field] = e.message;
        });
        setFieldErrors(errs);
        setError(`Please complete ${errors.length} required field${errors.length > 1 ? 's' : ''} before continuing.`);
        return;
      }
      setFieldErrors({});

      // Auto-save when leaving clinical questions
      await saveSectionB();
    }

    setCurrentStep(step);
    window.scrollTo(0, 0);
  };

  // ─── Sign & Submit ──────────────────────────────────────────────────────

  const handleSign = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError('Please provide your signature');
      return;
    }

    setSigning(true);
    setError('');
    try {
      await axios.post(`/api/sign/${token}/section-b`, { section_b_data: sectionBData }, { headers: authHeaders });
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

  // ─── Success screen ────────────────────────────────────────────────────

  if (signed) {
    return (
      <div className="signing-container">
        <div className="signing-header">
          <div className="signing-logo">UMS</div>
          <h1>Universal Medical Supply</h1>
        </div>
        <div className="card">
          <div className="success-card">
            <div className="success-card-icon">&#10003;</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Document Signed Successfully
            </h2>
            <p style={{ color: 'var(--color-gray-500)', maxWidth: '360px', margin: '0 auto' }}>
              Thank you. Universal Medical Supply has been notified and will process the signed document.
              You may close this window.
            </p>
          </div>
        </div>
        <div className="security-footer">
          <div className="security-footer-icon">&#128274;</div>
          <span>Your signature has been securely recorded with IP and timestamp.</span>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const validationIssues = currentStep === 2 ? validateFields() : [];
  const hasErrors = validationIssues.some((i) => i.severity === 'error');
  const warnings = validationIssues.filter((i) => i.severity === 'warning');

  return (
    <div className="signing-container">
      <div className="signing-header">
        <div className="signing-logo">UMS</div>
        <h1>Universal Medical Supply</h1>
        <p>{getFormTypeLabel(formType)}</p>
      </div>

      {/* ─── Progress Stepper ──────────────────────────────────────── */}
      <div className="wizard-stepper">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={`wizard-step ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
          >
            <div className="wizard-step-number">
              {i < currentStep ? (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="wizard-step-label">{step}</span>
          </div>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* ─── Step 1: Review Info ───────────────────────────────────── */}
      {currentStep === 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
            Please confirm the following information
          </h3>
          <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Review the pre-filled details below. If anything is incorrect, please contact Universal Medical Supply before proceeding.
          </p>

          <div className="info-grid">
            <div className="info-section">
              <h4 className="info-section-title">Physician</h4>
              <div className="info-row">
                <span className="info-label">Name</span>
                <span className="info-value">{formContext.physician?.name || 'Not available'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">NPI</span>
                <span className="info-value">{formContext.physician?.npi || 'Not available'}</span>
              </div>
              {formContext.physician?.practice_name && (
                <div className="info-row">
                  <span className="info-label">Practice</span>
                  <span className="info-value">{formContext.physician.practice_name}</span>
                </div>
              )}
            </div>

            <div className="info-section">
              <h4 className="info-section-title">Patient</h4>
              <div className="info-row">
                <span className="info-label">Name</span>
                <span className="info-value">{formContext.patient?.name || 'Not available'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Date of Birth</span>
                <span className="info-value">
                  {formContext.patient?.date_of_birth
                    ? new Date(formContext.patient.date_of_birth).toLocaleDateString()
                    : 'Not available'}
                </span>
              </div>
              {formContext.patient?.medicare_id && (
                <div className="info-row">
                  <span className="info-label">Medicare ID</span>
                  <span className="info-value">{formContext.patient.medicare_id}</span>
                </div>
              )}
              {formContext.patient?.insurance_id && (
                <div className="info-row">
                  <span className="info-label">Insurance ID</span>
                  <span className="info-value">{formContext.patient.insurance_id}</span>
                </div>
              )}
            </div>

            <div className="info-section">
              <h4 className="info-section-title">Document</h4>
              <div className="info-row">
                <span className="info-label">Form Type</span>
                <span className="info-value">{getFormTypeLabel(formType)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={() => goToStep(1)}>
              Continue to Clinical Questions
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Clinical Questions (Section B) ────────────────── */}
      {currentStep === 1 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>
            Section B — Clinical Information
          </h3>
          <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {getClinicalInstructions(formType)}
          </p>

          {visibleFields.map((field) => (
            <div className={`form-group ${fieldErrors[field.key] ? 'has-error' : ''}`} key={field.key}>
              <label>
                {field.label}
                {field.required && <span className="field-required">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  className="form-input"
                  rows={3}
                  value={sectionBData[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.hint}
                />
              ) : field.type === 'select' ? (
                <select
                  className="form-select"
                  value={sectionBData[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || 'text'}
                  className="form-input"
                  value={sectionBData[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.hint}
                />
              )}
              {fieldErrors[field.key] && <span className="field-error-text">{fieldErrors[field.key]}</span>}
              {field.hint && !fieldErrors[field.key] && (
                <span className="field-hint">{field.hint}</span>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn btn-outline" onClick={() => goToStep(0)}>
              Back
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline" onClick={saveSectionB} disabled={saving}>
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
              <button className="btn btn-primary" onClick={() => goToStep(2)}>
                Review & Sign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review & Sign ─────────────────────────────────── */}
      {currentStep === 2 && (
        <>
          {/* Compliance warnings */}
          {warnings.length > 0 && (
            <div className="warning-message" style={{ marginBottom: '1rem' }}>
              <strong>Compliance Notes:</strong>
              <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                {warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Review summary */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
              Review Your Responses
            </h3>
            <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Please confirm all information is correct before signing.
            </p>

            <div className="review-grid">
              {visibleFields.map((field) => {
                const value = sectionBData[field.key];
                return (
                  <div className="review-row" key={field.key}>
                    <span className="review-label">{field.label}</span>
                    <span className={`review-value ${!value ? 'review-empty' : ''}`}>
                      {value || '(not provided)'}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              className="btn btn-outline"
              onClick={() => goToStep(1)}
              style={{ marginTop: '1rem' }}
            >
              Edit Responses
            </button>
          </div>

          {/* Signature Pad */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
              Physician Signature
            </h3>
            <p style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              By signing below, I certify that the information provided is true, accurate, and complete
              to the best of my knowledge, and that the equipment/services described are medically necessary
              for this patient.
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
              <button
                className="btn btn-primary"
                onClick={handleSign}
                disabled={signing || hasErrors}
                style={{ flex: 1 }}
              >
                {signing ? 'Signing...' : 'Sign & Submit'}
              </button>
            </div>

            {hasErrors && (
              <div className="error-message" style={{ marginTop: '1rem' }}>
                Please go back and complete all required fields before signing.
              </div>
            )}

            <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '1rem' }}>
              This electronic signature is legally binding under the E-SIGN Act and UETA.
              Your IP address and timestamp will be recorded as part of the audit trail.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '1rem', marginBottom: '1rem' }}>
            <button className="btn btn-outline" onClick={() => goToStep(1)}>
              Back to Clinical Questions
            </button>
          </div>
        </>
      )}

      <div className="security-footer">
        <div className="security-footer-icon">&#128274;</div>
        <span>HIPAA-compliant secure portal</span>
      </div>
    </div>
  );
}

// ─── Form type labels ─────────────────────────────────────────────────────

function getFormTypeLabel(formType: string): string {
  const labels: Record<string, string> = {
    'CMS-484': 'CMS-484 — Oxygen Equipment',
    'CMS-10126': 'CMS-10126 — Hospital Beds',
    'CMS-10125': 'CMS-10125 — Power Mobility Devices',
    'PRIOR-AUTH': 'Prior Authorization Request',
  };
  return labels[formType] || formType;
}

function getClinicalInstructions(formType: string): string {
  const instructions: Record<string, string> = {
    'CMS-484': 'Complete the following oxygen-related clinical information. Fields marked with * are required for Medicare compliance.',
    'CMS-10126': 'Complete the hospital bed clinical justification. Fields marked with * are required for Medicare compliance.',
    'CMS-10125': 'Complete the power mobility evaluation details. Fields marked with * are required for Medicare compliance.',
    'PRIOR-AUTH': 'Provide clinical details supporting the medical necessity of the requested equipment.',
  };
  return instructions[formType] || 'Please answer the following clinical questions.';
}

// ─── Section B field definitions with conditional logic ───────────────────

function getSectionBFields(formType: string): FieldDef[] {
  switch (formType) {
    case 'CMS-484':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text', required: true, hint: 'e.g., J44.1 — COPD with acute exacerbation' },
        { key: 'o2_test_date', label: 'Date of most recent qualifying blood gas or oximetry test', type: 'date', required: true },
        { key: 'o2_test_type', label: 'Test type', type: 'select', options: ['Arterial blood gas (ABG)', 'Pulse oximetry (SpO2)'], required: true },
        { key: 'o2_test_result', label: 'ABG PaO2 result (mmHg)', type: 'text', required: true, showWhen: { field: 'o2_test_type', value: 'Arterial blood gas (ABG)' }, hint: 'Qualifying: PaO2 <= 55 mmHg or 56-59 with qualifying condition' },
        { key: 'o2_spo2_result', label: 'SpO2 result (%)', type: 'text', required: true, showWhen: { field: 'o2_test_type', value: 'Pulse oximetry (SpO2)' }, hint: 'Qualifying: SpO2 <= 88% or 89% with qualifying condition' },
        { key: 'o2_test_condition', label: 'Condition during test', type: 'select', options: ['At rest', 'During exercise', 'During sleep'], required: true },
        { key: 'qualifying_condition', label: 'Qualifying secondary condition (if borderline values)', type: 'select', options: ['None', 'Dependent edema from CHF', 'Pulmonary hypertension (cor pulmonale)', 'Erythrocythemia (hematocrit > 56%)'], hint: 'Required if PaO2 56-59 or SpO2 89%' },
        { key: 'lpm_prescribed', label: 'Liters per minute (LPM) prescribed', type: 'number', required: true },
        { key: 'o2_frequency', label: 'Frequency of use', type: 'select', options: ['Continuous', 'During sleep only', 'During exercise only', 'PRN'], required: true },
        { key: 'portable_needed', label: 'Is portable oxygen equipment needed?', type: 'select', options: ['Yes', 'No'], required: true },
        { key: 'portable_reason', label: 'Reason portable oxygen is needed', type: 'textarea', showWhen: { field: 'portable_needed', value: 'Yes' }, required: true, hint: 'Describe patient mobility needs requiring portable equipment' },
        { key: 'clinical_notes', label: 'Additional clinical notes', type: 'textarea' },
      ];
    case 'CMS-10126':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text', required: true, hint: 'e.g., M62.81 — Muscle weakness' },
        { key: 'mobility_limitation', label: 'Describe mobility limitation requiring hospital bed', type: 'textarea', required: true },
        { key: 'bed_type', label: 'Type of bed needed', type: 'select', options: ['Fixed height', 'Variable height', 'Semi-electric', 'Total electric'], required: true },
        { key: 'bed_type_justification', label: 'Why is this specific bed type required?', type: 'textarea', required: true, showWhen: { field: 'bed_type', value: ['Semi-electric', 'Total electric'] }, hint: 'Medicare requires additional justification for semi-electric and total electric beds' },
        { key: 'side_rails', label: 'Side rails needed?', type: 'select', options: ['Yes', 'No'], required: true },
        { key: 'side_rails_justification', label: 'Clinical justification for side rails', type: 'textarea', showWhen: { field: 'side_rails', value: 'Yes' }, required: true },
        { key: 'mattress_type', label: 'Mattress type', type: 'select', options: ['Standard', 'Pressure reduction', 'Alternating pressure', 'Low air loss'], required: true },
        { key: 'pressure_ulcer_history', label: 'Does the patient have a history of or current pressure ulcers?', type: 'select', options: ['Yes — current pressure ulcer', 'Yes — history of pressure ulcers', 'No — but at high risk', 'No'], showWhen: { field: 'mattress_type', value: ['Pressure reduction', 'Alternating pressure', 'Low air loss'] }, required: true },
        { key: 'clinical_justification', label: 'Clinical justification for medical necessity', type: 'textarea', required: true },
      ];
    case 'CMS-10125':
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text', required: true, hint: 'e.g., G80.9 — Cerebral palsy, unspecified' },
        { key: 'mobility_limitation', label: 'Describe mobility limitation in the home', type: 'textarea', required: true, hint: 'Describe how the limitation affects mobility-related activities of daily living (MRADLs)' },
        { key: 'manual_wheelchair_tried', label: 'Has a manual wheelchair been considered or tried?', type: 'select', options: ['Yes — tried and insufficient', 'Yes — considered but contraindicated', 'No — patient cannot self-propel'], required: true },
        { key: 'manual_wheelchair_insufficient', label: 'Why is a manual wheelchair insufficient?', type: 'textarea', required: true, hint: 'Document why a manual wheelchair does not meet the patient\'s mobility needs in the home' },
        { key: 'can_operate_pov', label: 'Can patient safely operate a POV/power wheelchair?', type: 'select', options: ['Yes', 'No — caregiver will operate', 'Requires further evaluation'], required: true },
        { key: 'caregiver_info', label: 'Describe caregiver availability and capability', type: 'textarea', showWhen: { field: 'can_operate_pov', value: 'No — caregiver will operate' }, required: true, hint: 'Caregiver must be available, willing, and able to operate the device' },
        { key: 'home_assessment', label: 'Has a home assessment been completed?', type: 'select', options: ['Yes', 'No — scheduled', 'No'], required: true },
        { key: 'home_assessment_date', label: 'Home assessment date', type: 'date', showWhen: { field: 'home_assessment', value: 'Yes' } },
        { key: 'face_to_face_date', label: 'Date of face-to-face examination', type: 'date', required: true, hint: 'Must be within 45 days before the written order' },
        { key: 'specialty_eval', label: 'Has a specialty evaluation been completed (PT/OT)?', type: 'select', options: ['Yes', 'No — scheduled', 'No — not required'], required: true },
        { key: 'clinical_justification', label: 'Clinical justification for power mobility', type: 'textarea', required: true },
      ];
    default: // PRIOR-AUTH or generic
      return [
        { key: 'diagnosis', label: 'Primary diagnosis (ICD-10)', type: 'text', required: true },
        { key: 'equipment_description', label: 'Equipment/supply being requested', type: 'text', required: true },
        { key: 'hcpcs_code', label: 'HCPCS code (if known)', type: 'text', hint: 'e.g., E1390, K0823' },
        { key: 'medical_necessity', label: 'Medical necessity / clinical justification', type: 'textarea', required: true, hint: 'Describe why this equipment is medically necessary for this patient' },
        { key: 'duration', label: 'Expected duration of need', type: 'select', options: ['1-3 months', '3-6 months', '6-12 months', 'Lifetime / indefinite'], required: true },
        { key: 'alternatives_tried', label: 'Alternative treatments tried', type: 'textarea', required: true, hint: 'Document what alternatives have been tried and why they were insufficient' },
        { key: 'additional_notes', label: 'Additional notes', type: 'textarea' },
      ];
  }
}

// ─── Compliance validation rules ──────────────────────────────────────────

function getComplianceWarnings(formType: string, data: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (formType) {
    case 'CMS-484': {
      // Check if oxygen test results are in qualifying range
      const testType = data.o2_test_type;
      if (testType === 'Arterial blood gas (ABG)' && data.o2_test_result) {
        const pao2 = parseFloat(data.o2_test_result);
        if (!isNaN(pao2)) {
          if (pao2 > 59) {
            issues.push({
              field: 'o2_test_result',
              label: 'ABG Result',
              severity: 'warning',
              message: `PaO2 of ${pao2} mmHg may not meet Medicare qualifying threshold (PaO2 <= 55, or 56-59 with qualifying condition). Please verify.`,
            });
          } else if (pao2 >= 56 && pao2 <= 59 && (!data.qualifying_condition || data.qualifying_condition === 'None')) {
            issues.push({
              field: 'qualifying_condition',
              label: 'Qualifying condition',
              severity: 'warning',
              message: 'PaO2 of 56-59 requires a qualifying secondary condition (dependent edema, pulmonary hypertension, or erythrocythemia) for Medicare coverage.',
            });
          }
        }
      }
      if (testType === 'Pulse oximetry (SpO2)' && data.o2_spo2_result) {
        const spo2 = parseFloat(data.o2_spo2_result);
        if (!isNaN(spo2)) {
          if (spo2 > 89) {
            issues.push({
              field: 'o2_spo2_result',
              label: 'SpO2 Result',
              severity: 'warning',
              message: `SpO2 of ${spo2}% may not meet Medicare qualifying threshold (SpO2 <= 88%, or 89% with qualifying condition). Please verify.`,
            });
          } else if (spo2 === 89 && (!data.qualifying_condition || data.qualifying_condition === 'None')) {
            issues.push({
              field: 'qualifying_condition',
              label: 'Qualifying condition',
              severity: 'warning',
              message: 'SpO2 of 89% requires a qualifying secondary condition for Medicare coverage.',
            });
          }
        }
      }
      // Check test date is not too old
      if (data.o2_test_date) {
        const testDate = new Date(data.o2_test_date);
        const daysSinceTest = Math.floor((Date.now() - testDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceTest > 30) {
          issues.push({
            field: 'o2_test_date',
            label: 'Test date',
            severity: 'warning',
            message: `Blood gas/oximetry test was ${daysSinceTest} days ago. Some MACs require testing within 30 days. Consider whether re-testing is needed.`,
          });
        }
      }
      break;
    }
    case 'CMS-10125': {
      // Check face-to-face timing
      if (data.face_to_face_date) {
        const f2fDate = new Date(data.face_to_face_date);
        const daysSinceF2F = Math.floor((Date.now() - f2fDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceF2F > 45) {
          issues.push({
            field: 'face_to_face_date',
            label: 'Face-to-face date',
            severity: 'warning',
            message: `Face-to-face encounter was ${daysSinceF2F} days ago. Medicare requires the F2F within 45 days before the written order.`,
          });
        }
      }
      // Home assessment warning
      if (data.home_assessment === 'No') {
        issues.push({
          field: 'home_assessment',
          label: 'Home assessment',
          severity: 'warning',
          message: 'A home assessment is required before a power mobility device can be ordered. This must be completed before the order date.',
        });
      }
      // Specialty eval warning
      if (data.specialty_eval === 'No — not required') {
        issues.push({
          field: 'specialty_eval',
          label: 'Specialty evaluation',
          severity: 'warning',
          message: 'CRT power wheelchairs require a specialty evaluation by a licensed PT or OT with wheelchair evaluation experience.',
        });
      }
      break;
    }
    case 'CMS-10126': {
      // Pressure ulcer documentation for specialty mattresses
      const specialtyMattress = ['Pressure reduction', 'Alternating pressure', 'Low air loss'];
      if (specialtyMattress.includes(data.mattress_type) && data.pressure_ulcer_history === 'No') {
        issues.push({
          field: 'pressure_ulcer_history',
          label: 'Pressure ulcer history',
          severity: 'warning',
          message: 'Specialty mattresses typically require documentation of pressure ulcer risk or history for Medicare coverage.',
        });
      }
      break;
    }
  }

  return issues;
}
