import Modal from '../../../components/ui/Modal';
import { formatCourseName } from '../../../utils/courseDisplay';
import { HiOutlineCheckCircle } from 'react-icons/hi';

export default function StudentExcelImportModal({
  isOpen,
  onClose,
  excelForm,
  setExcelForm,
  activeCourses,
  excelSemesters,
  excelFileInputRef,
  excelFile,
  setExcelFile,
  excelImporting,
  excelResults,
  onImport,
  onImportAnother
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Students from Excel" width={580}>
      {!excelResults ? (
        <>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Upload an <strong>.xlsx</strong> file with columns:
            {' '}<code>Name</code>, <code>RollNo</code>, <code>RegdNo</code>, <code>Email</code>,
            {' '}<code>PhoneNo</code> (optional). Name, RegdNo, and Email are mandatory.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course *</label>
              <select
                className="input-field"
                value={excelForm.course_id}
                onChange={(e) => setExcelForm({ course_id: e.target.value, semester: '' })}
              >
                <option value="">Select course</option>
                {activeCourses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {formatCourseName(c.name, { status: c.status })} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Semester *</label>
              <select
                className="input-field"
                value={excelForm.semester}
                onChange={(e) => setExcelForm({ ...excelForm, semester: e.target.value })}
                disabled={!excelForm.course_id}
              >
                <option value="">Select semester</option>
                {excelSemesters.map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Excel File (.xlsx) *</label>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xltx"
              className="input-field"
              style={{ padding: '8px 12px', cursor: 'pointer' }}
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            />
            {excelFile && (
              <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent-emerald)' }}>
                ✓ {excelFile.name} ({(excelFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 18, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Expected column headers (row 1):</strong>
            <br />
            <code>Name</code> · <code>RollNo</code> · <code>RegdNo</code> · <code>Email</code> · <code>PhoneNo</code>
            <br />
            Duplicate emails are skipped automatically. Each student gets an auto-generated temporary password.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose} disabled={excelImporting}>Cancel</button>
            <button className="btn-primary" onClick={onImport} disabled={excelImporting || !excelForm.course_id || !excelForm.semester || !excelFile}>
              {excelImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 700, margin: 0 }}>{excelResults.message}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Created: {excelResults.created} &nbsp;·&nbsp; Skipped: {excelResults.skipped} &nbsp;·&nbsp; Errors: {excelResults.errors}
              </p>
            </div>
          </div>

          {excelResults.results?.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
              <table className="data-table" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Temp Password / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {excelResults.results.map((r) => (
                    <tr key={r.row} style={{ opacity: r.status === 'skipped' || r.status === 'error' ? 0.65 : 1 }}>
                      <td>{r.row}</td>
                      <td>{r.name || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: r.status === 'created' ? 'rgba(52,211,153,0.15)' : r.status === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
                          color: r.status === 'created' ? 'var(--accent-emerald)' : r.status === 'error' ? '#f87171' : '#fbbf24',
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: r.temp_password ? 'monospace' : 'inherit', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {r.temp_password || r.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={onImportAnother}>Import Another File</button>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}
