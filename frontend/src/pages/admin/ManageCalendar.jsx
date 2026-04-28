import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { HiOutlineCloudUpload, HiOutlineDocumentText, HiOutlinePencilAlt, HiOutlineCheckCircle } from 'react-icons/hi';
import api from '../../api/axios';
import AcademicCalendarPanel from '../../components/calendar/AcademicCalendarPanel';
import StatePanel from '../../components/ui/StatePanel';

function cloneArray(value) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

export default function ManageCalendar() {
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState({
    title: '',
    year: new Date().getFullYear(),
    notes: '',
    department_id: '',
  });

  const updateDraftField = (field, value) => {
    setDraft((prev) => prev ? ({ ...prev, [field]: value }) : prev);
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      toast.error('Choose a calendar image or Excel file first');
      return;
    }

    const isExcel = selectedFile.name.toLowerCase().endsWith('.xlsx') ||
                   selectedFile.name.toLowerCase().endsWith('.xlsm') ||
                   selectedFile.name.toLowerCase().endsWith('.xltx');

    const payload = new FormData();
    if (isExcel) {
      payload.append('file', selectedFile);
    } else {
      payload.append('image', selectedFile);
    }
    payload.append('year', String(form.year || new Date().getFullYear()));

    setExtracting(true);
    setError('');
    try {
      const endpoint = isExcel ? '/calendar/extract-excel' : '/calendar/extract';
      const res = await api.post(endpoint, payload);
      const extracted = res.data || {};
      setDraft({
        ...extracted,
        title: extracted.title || form.title || `Academic Calendar ${extracted.year || form.year}`,
        notes: extracted.notes || form.notes || '',
        department_id: '',
        holidays: cloneArray(extracted.holidays),
        optional_holidays: cloneArray(extracted.optional_holidays),
        sundays: Array.isArray(extracted.sundays) ? [...extracted.sundays] : [],
      });
      setForm((prev) => ({
        ...prev,
        title: extracted.title || prev.title,
        year: extracted.year || prev.year,
      }));
      toast.success(isExcel ? 'Excel data extracted successfully' : 'Calendar OCR extracted successfully');
    } catch (err) {
      const message = err?.response?.data?.error || `Failed to extract calendar from ${isExcel ? 'Excel' : 'image'}`;
      setError(message);
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  };

  const handlePublish = async () => {
    if (!draft) {
      toast.error('Extract a calendar first');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await api.post('/calendar/save', {
        ...draft,
        title: draft.title || `Academic Calendar ${draft.year}`,
        notes: draft.notes || '',
        department_id: '',
        year: Number(draft.year || form.year || new Date().getFullYear()),
      });
      toast.success(res.data?.message || 'Calendar published successfully');
      setDraft((prev) => prev ? ({ ...prev, status: 'published' }) : prev);
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to publish calendar';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = (index) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, holidays: prev.holidays.filter((_, itemIndex) => itemIndex !== index) };
    });
  };

  const removeOptionalHoliday = (index) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, optional_holidays: prev.optional_holidays.filter((_, itemIndex) => itemIndex !== index) };
    });
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section className="glass-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <HiOutlineCloudUpload size={20} style={{ color: 'var(--accent-cyan)' }} />
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Academic Calendar Management</h1>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 720 }}>
              Upload an official university calendar image (OCR) or an Excel spreadsheet (.xlsx) to sync institution-wide holidays.
              Excel files must contain: <strong>eventName, startDate, endDate, eventType</strong>.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</p>
            <p style={{ fontSize: '0.88rem', fontWeight: 700 }}>Global Scope</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Calendar year</label>
            <input
              className="input-field"
              type="number"
              value={form.year}
              onChange={(e) => setForm((prev) => ({ ...prev, year: Number(e.target.value) || new Date().getFullYear() }))}
              min="2000"
              max="2100"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Calendar title</label>
            <input
              className="input-field"
              type="text"
              placeholder="Academic Calendar 2026"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Calendar Source</label>
            <input
              className="input-field"
              type="file"
              accept="image/*, .xlsx, .xlsm, .xltx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={handleExtract} disabled={extracting}>
            <HiOutlinePencilAlt size={16} /> {extracting ? 'Processing...' : 'Extract Data'}
          </button>
          <button type="button" className="btn-primary" onClick={handlePublish} disabled={saving || !draft}>
            <HiOutlineCheckCircle size={16} /> {saving ? 'Publishing...' : 'Publish Calendar'}
          </button>
        </div>

        {error ? (
          <div style={{ marginTop: 14 }}>
            <StatePanel variant="error" title="Calendar verification error" description={error} compact />
          </div>
        ) : null}
      </section>

      {draft ? (
        <motion.section className="glass-card" style={{ padding: 20 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <HiOutlineDocumentText size={18} style={{ color: 'var(--accent-emerald)' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Calendar Verification Draft</h2>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Review the extracted data before publishing the calendar.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-info">{draft.year}</span>
              <span className="badge badge-success">{draft.status || 'draft'}</span>
              <span className="badge badge-info">{(draft.holidays || []).length} holidays</span>
              <span className="badge badge-warning">{(draft.optional_holidays || []).length} optional</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Title</label>
              <input className="input-field" value={draft.title || ''} onChange={(e) => updateDraftField('title', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Year</label>
              <input className="input-field" type="number" value={draft.year || form.year} onChange={(e) => updateDraftField('year', Number(e.target.value) || form.year)} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Notes</label>
              <input className="input-field" value={draft.notes || ''} onChange={(e) => updateDraftField('notes', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: 10 }}>Official holidays</h3>
              <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
                {(draft.holidays || []).map((holiday, index) => (
                  <div key={`${holiday.date}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 12, background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.16)' }}>
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700 }}>{holiday.label || 'Holiday'}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{holiday.date}</p>
                    </div>
                    <button type="button" className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => removeHoliday(index)}>Remove</button>
                  </div>
                ))}
                {(draft.holidays || []).length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No holidays extracted yet.</p> : null}
              </div>
            </div>

            <div style={{ padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: 10 }}>Optional holidays</h3>
              <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
                {(draft.optional_holidays || []).map((holiday, index) => (
                  <div key={`${holiday.date}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 10, borderRadius: 12, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.16)' }}>
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700 }}>{holiday.label || 'Optional holiday'}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{holiday.date}</p>
                    </div>
                    <button type="button" className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => removeOptionalHoliday(index)}>Remove</button>
                  </div>
                ))}
                {(draft.optional_holidays || []).length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No optional holidays extracted yet.</p> : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(34, 211, 238, 0.06)', border: '1px solid rgba(34, 211, 238, 0.12)' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Source file</p>
              <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>{draft.source_filename || selectedFile?.name || 'Unknown file'}</p>
            </div>
            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(34, 211, 238, 0.06)', border: '1px solid rgba(34, 211, 238, 0.12)' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sundays detected</p>
              <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>{Array.isArray(draft.sundays) ? draft.sundays.length : 0}</p>
            </div>
          </div>
        </motion.section>
      ) : null}

      <AcademicCalendarPanel compact />
    </div>
  );
}
