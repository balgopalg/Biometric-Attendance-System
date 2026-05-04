import { HiOutlineCheckCircle } from 'react-icons/hi';
import Modal from '../../../components/ui/Modal';

export default function ExcelImportModal({
  isOpen, onClose, excelFile, setExcelFile, excelFileInputRef,
  excelImporting, excelResults, setExcelResults, onImport,
}) {
  return (
    <Modal isOpen={isOpen} onClose={() => { if (!excelImporting) { onClose(); setExcelResults(null); } }} title="Import Lecturers from Excel" width={560}>
      {!excelResults ? (
        <>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Upload an <strong>.xlsx</strong> file with columns: <code>Department</code>, <code>Name</code>, <code>Email</code>, <code>Courses</code>, and <code>Papers</code>.
            <code>Courses</code> and <code>Papers</code> must be comma-separated codes.
            Only existing course and paper codes are assigned.
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Excel File (.xlsx) *</label>
            <input ref={excelFileInputRef} type="file" accept=".xlsx,.xlsm,.xltx" className="input-field" style={{ padding: '8px 12px', cursor: 'pointer' }} onChange={(e) => setExcelFile(e.target.files?.[0] || null)} />
            {excelFile && <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent-emerald)' }}>✓ {excelFile.name} ({(excelFile.size / 1024).toFixed(1)} KB)</p>}
          </div>
          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 18, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Expected column headers (row 1):</strong><br />
            <code>Department</code> · <code>Name</code> · <code>Email</code> · <code>Courses</code> · <code>Papers</code><br />
            Duplicate emails are skipped automatically.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose} disabled={excelImporting}>Cancel</button>
            <button className="btn-primary" onClick={onImport} disabled={excelImporting || !excelFile}>{excelImporting ? 'Importing...' : 'Import'}</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 700, margin: 0 }}>{excelResults.message}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Created: {excelResults.created} &nbsp;·&nbsp; Skipped: {excelResults.skipped} &nbsp;·&nbsp; Errors: {excelResults.errors}</p>
            </div>
          </div>
          {excelResults.results?.length > 0 && (
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
              <table className="data-table" style={{ fontSize: '0.78rem' }}>
                <thead><tr><th>Row</th><th>Department</th><th>Name</th><th>Email</th><th>Status</th><th>Courses</th><th>Papers</th><th>Temp Password / Reason</th></tr></thead>
                <tbody>
                  {excelResults.results.map((r) => (
                    <tr key={r.row} style={{ opacity: r.status === 'skipped' || r.status === 'error' ? 0.65 : 1 }}>
                      <td>{r.row}</td>
                      <td>{r.department || '—'}</td>
                      <td>{r.name || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: r.status === 'created' ? 'rgba(52,211,153,0.15)' : r.status === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)', color: r.status === 'created' ? 'var(--accent-emerald)' : r.status === 'error' ? '#f87171' : '#fbbf24' }}>{r.status}</span>
                      </td>
                      <td>{Array.isArray(r.matched_courses) ? (r.matched_courses.length ? r.matched_courses.join(', ') : '—') : (r.assigned_course_count ? String(r.assigned_course_count) : '—')}</td>
                      <td>{Array.isArray(r.matched_papers) ? (r.matched_papers.length ? r.matched_papers.join(', ') : '—') : (r.assigned_paper_count ? String(r.assigned_paper_count) : '—')}</td>
                      <td style={{ fontFamily: r.temp_password ? 'monospace' : 'inherit', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.temp_password || r.reason || r.department_warning || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {excelResults.results?.some((r) => r.department_warning) && (
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 16 }}>Rows with a department warning were imported using the raw department text because no exact department match was found.</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={() => { setExcelResults(null); setExcelFile(null); if (excelFileInputRef.current) excelFileInputRef.current.value = ''; }}>Import Another File</button>
            <button className="btn-primary" onClick={() => { onClose(); setExcelResults(null); }}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}
