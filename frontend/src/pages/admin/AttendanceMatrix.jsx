import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { HiOutlineDocumentDownload } from 'react-icons/hi';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { formatCourseName } from '../../utils/courseDisplay';
import { getIndiaTimezoneOffsetMinutes } from '../../utils/dateTime';
import { useAuth } from '../../hooks/useAuth';

const STICKY_ROLL_LEFT = 0;
const STICKY_NAME_LEFT = 148;
const TOTAL_PERCENT_WIDTH = 84;
const TOTAL_HELD_WIDTH = 96;
const TOTAL_ATTENDED_WIDTH = 96;
const TOTAL_PERCENT_RIGHT = 0;
const TOTAL_HELD_RIGHT = TOTAL_PERCENT_WIDTH;
const TOTAL_ATTENDED_RIGHT = TOTAL_PERCENT_WIDTH + TOTAL_HELD_WIDTH;

function buildQueryParams(filters) {
  const params = {
    ...filters,
    tz_offset_minutes: getIndiaTimezoneOffsetMinutes(),
  };
  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] === null || params[key] === undefined) {
      delete params[key];
    }
  });
  return params;
}

function toSubjectAbbreviation(name = '') {
  const text = String(name || '').trim();
  if (!text) return '';

  const words = text
    .replace(/[(){}[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return '';
  if (words.length === 1) {
    const cleaned = words[0].replace(/[^A-Za-z0-9]/g, '');
    return cleaned.slice(0, 3).toUpperCase();
  }

  return words
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 4);
}

function formatSubjectHeader(subject) {
  const code = String(subject?.subject_code || '').trim();
  const name = String(subject?.subject_name || '').trim();
  const abbr = toSubjectAbbreviation(name);

  if (code && abbr) {
    const normalizedCode = code.toUpperCase();
    if (normalizedCode.includes(`(${abbr})`)) return code;
    return `${code}(${abbr})`;
  }
  return code || name || 'SUB';
}

export default function AttendanceMatrix() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();

  const [loading, setLoading] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [payload, setPayload] = useState({ dates: [], rows: [], meta: {}, options: {} });
  const [matrixError, setMatrixError] = useState('');
  const [filters, setFilters] = useState({
    department_id: '',
    course_id: '',
    academic_session: '',
    semester: '',
    from_date: '',
    to_date: '',
  });

  const activeCourses = useMemo(() => {
    const sourceCourses = Array.isArray(courses) ? courses : [];
    return sourceCourses.filter((c) => String(c.status || 'active').toLowerCase() === 'active');
  }, [courses]);

  const semesterOptions = useMemo(() => {
    const fromPayload = Array.isArray(payload.options?.semesters) ? payload.options.semesters : [];
    if (fromPayload.length > 0) return fromPayload.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
    return Array.from({ length: 10 }, (_, idx) => idx + 1);
  }, [payload.options]);

  const sessionOptions = useMemo(
    () => (Array.isArray(payload.options?.academic_sessions) ? payload.options.academic_sessions : []),
    [payload.options]
  );

  const safeDates = useMemo(() => (Array.isArray(payload.dates) ? payload.dates : []), [payload.dates]);
  const safeRows = useMemo(() => (Array.isArray(payload.rows) ? payload.rows : []), [payload.rows]);
  // Matrix renders as soon as dept+course are chosen; session/semester narrow it further
  const isFilterComplete = Boolean(filters.course_id);
  // Exports remain gated on full filter selection for meaningful data
  const isExportReady = Boolean(filters.department_id && filters.course_id && filters.academic_session && filters.semester);
  const visibleDates = isFilterComplete ? safeDates : [];
  const visibleRows = isFilterComplete ? safeRows : [];

  const fetchMatrix = async (signal) => {
    // For dept admins, always have department_id; super admins can browse all
    if (!filters.course_id) {
       setPayload({ dates: [], rows: [], meta: {}, options: {} });
       setMatrixError('');
       return;
    }
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
      const message = 'From date must be before or equal to To date';
      setMatrixError(message);
      setPayload({ dates: [], rows: [], meta: {}, options: {} });
      return;
    }
    setLoading(true);
    setMatrixError('');
    try {
      const params = buildQueryParams(filters);
      const res = await api.get('/admin/attendance-matrix', { params, signal });
      setPayload(res.data || { dates: [], rows: [], meta: {}, options: {} });
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED') {
        const message = err.response?.data?.error || 'Failed to load attendance matrix';
        toast.error(message);
        setPayload({ dates: [], rows: [], meta: {}, options: {} });
        setMatrixError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    } else if (isDepartmentAdmin && departmentId && departmentName) {
      setDepartments([{ _id: departmentId, name: departmentName }]);
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  }, [isSuperAdmin, isDepartmentAdmin, departmentId, departmentName]);

  useEffect(() => {
    const controller = new AbortController();
    const params = {};
    if (filters.department_id) params.department_id = filters.department_id;
    api.get('/admin/courses', { params, signal: controller.signal })
      .then((res) => {
        const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
        setCourses(items);
      })
      .catch((err) => {
        if (err?.code !== 'ERR_CANCELED') {
          setCourses([]);
        }
      });

    return () => controller.abort();
  }, [filters.department_id]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMatrix(controller.signal);
    return () => controller.abort();
  }, [filters]);

  const downloadBlob = (response, fallbackName) => {
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || fallbackName;

    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    setDownloadingExcel(true);
    try {
      const params = buildQueryParams(filters);
      const response = await api.get('/admin/attendance-matrix/export', {
        params,
        responseType: 'blob',
      });

      downloadBlob(response, `attendance_matrix_${Date.now()}.xlsx`);
      toast.success('Excel generated successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to export Excel');
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleExportCsv = async () => {
    setDownloadingCsv(true);
    try {
      const params = buildQueryParams(filters);
      const response = await api.get('/admin/attendance-matrix/export-csv', {
        params,
        responseType: 'blob',
      });

      downloadBlob(response, `attendance_matrix_${Date.now()}.csv`);
      toast.success('CSV generated successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to export CSV');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const getRowTotals = (row) => {
    let totalHeld = 0;
    let totalAttended = 0;

    visibleDates.forEach((dateEntry) => {
      (Array.isArray(dateEntry.subjects) ? dateEntry.subjects : []).forEach((subject) => {
        totalHeld += 1;
        const value = String((row.cells || {})[subject.column_key] || 'X').trim().toUpperCase();
        if (value !== 'X') {
          totalAttended += 1;
        }
      });
    });

    const percentage = totalHeld > 0 ? `${((totalAttended / totalHeld) * 100).toFixed(2)}%` : '0%';
    return { totalHeld, totalAttended, percentage };
  };

  if (!loading && matrixError) {
    return (
      <div className="admin-page" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
        <StatePanel variant="error" title="Unable to load attendance matrix" description={matrixError} actionLabel="Retry" onAction={() => fetchMatrix()} compact />
      </div>
    );
  }

  return (
    <div className="admin-page" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance Matrix</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 3 }}>
            Month/period-wise attendance grouped by date and subject.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Students</p>
            <p style={{ fontSize: '1rem', fontWeight: 700 }}>{isFilterComplete ? (payload.meta?.students_count || 0) : 0}</p>
          </div>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Dates</p>
            <p style={{ fontSize: '1rem', fontWeight: 700 }}>{isFilterComplete ? (payload.meta?.dates_count || 0) : 0}</p>
          </div>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Classes</p>
            <p style={{ fontSize: '1rem', fontWeight: 700 }}>{isFilterComplete ? (payload.meta?.sessions_count || 0) : 0}</p>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'center' }}>
          <select
            className="input-field"
            value={filters.department_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, department_id: e.target.value, course_id: '', semester: '' }))}
            disabled={isDepartmentAdmin}
          >
            <option value="">
              {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>

          <select
             className="input-field"
             value={filters.course_id}
             onChange={(e) => setFilters((prev) => ({ ...prev, course_id: e.target.value, semester: '' }))}
             disabled={!filters.department_id}
           >
             <option value="">Select Course...</option>
             {activeCourses.map((c) => (
               <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>
             ))}
           </select>

          <select
            className="input-field"
            value={filters.academic_session}
            onChange={(e) => setFilters((prev) => ({ ...prev, academic_session: e.target.value }))}
          >
            <option value="">All Academic Sessions</option>
            {sessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>

          <select
            className="input-field"
            value={filters.semester}
            onChange={(e) => setFilters((prev) => ({ ...prev, semester: e.target.value }))}
          >
            <option value="">All Semesters</option>
            {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>

          <input
            type="date"
            className="input-field"
            value={filters.from_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
            max={filters.to_date || undefined}
            style={{ display: 'flex', alignItems: 'center' }}
          />

          <input
            type="date"
            className="input-field"
            value={filters.to_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
            min={filters.from_date || undefined}
            style={{ display: 'flex', alignItems: 'center' }}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={handleExportCsv}
            disabled={downloadingCsv || !isExportReady}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <HiOutlineDocumentDownload size={16} />
            {downloadingCsv ? 'Generating CSV...' : 'Export CSV'}
          </button>
          <button
            className="btn-primary"
            onClick={handleExportExcel}
            disabled={downloadingExcel || !isExportReady}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <HiOutlineDocumentDownload size={16} />
            {downloadingExcel ? 'Generating Excel...' : 'Generate Excel'}
          </button>
        </div>
      </div>

      <div className="glass-card attendance-matrix-shell" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        {loading && !matrixError ? (
          <StatePanel variant="loading" title="Loading attendance matrix" description="Building date-wise attendance columns and totals." compact />
        ) : null}

        {!loading && matrixError ? (
          <StatePanel variant="error" title="Unable to load attendance matrix" description={matrixError} actionLabel="Retry" onAction={() => fetchMatrix()} compact />
        ) : null}

        {!loading && !matrixError && isFilterComplete && visibleRows.length === 0 ? (
          <StatePanel variant="empty" title="No attendance records found" description="No sessions match the selected filters." compact />
        ) : null}

        {!isFilterComplete ? (
          <StatePanel
            variant="empty"
            title="Select a Course"
            description="Choose a course (and optionally session/semester) to display the attendance matrix."
            compact
          />
        ) : null}

        {!loading && !matrixError && isFilterComplete && visibleRows.length > 0 ? (
        <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
        <table className="data-table attendance-matrix-table" style={{ width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr>
              <th
                rowSpan={2}
                style={{
                  position: 'sticky',
                  left: STICKY_ROLL_LEFT,
                  zIndex: 7,
                  background: 'var(--bg-card)',
                  minWidth: 148,
                  pointerEvents: 'auto',
                }}
              >
                Roll No
              </th>
              <th
                rowSpan={2}
                style={{
                  position: 'sticky',
                  left: STICKY_NAME_LEFT,
                  zIndex: 7,
                  background: 'var(--bg-card)',
                  minWidth: 220,
                  pointerEvents: 'auto',
                  textAlign: 'center',
                }}
              >
                Name
              </th>
              {visibleDates.map((dateEntry, idx) => (
                <th key={`${dateEntry.date}-${idx}`} colSpan={(Array.isArray(dateEntry.subjects) ? dateEntry.subjects : []).length} style={{ textAlign: 'center', top: 'auto', position: 'static' }}>
                  {dateEntry.date}
                </th>
              ))}
              <th
                rowSpan={2}
                style={{
                  position: 'sticky',
                  right: TOTAL_ATTENDED_RIGHT,
                  zIndex: 8,
                  background: 'var(--bg-card)',
                  minWidth: TOTAL_ATTENDED_WIDTH,
                  maxWidth: TOTAL_ATTENDED_WIDTH,
                  width: TOTAL_ATTENDED_WIDTH,
                  textAlign: 'center',
                  padding: '10px 8px',
                }}
              >
                TCA
              </th>
              <th
                rowSpan={2}
                style={{
                  position: 'sticky',
                  right: TOTAL_HELD_RIGHT,
                  zIndex: 8,
                  background: 'var(--bg-card)',
                  minWidth: TOTAL_HELD_WIDTH,
                  maxWidth: TOTAL_HELD_WIDTH,
                  width: TOTAL_HELD_WIDTH,
                  textAlign: 'center',
                  padding: '10px 8px',
                }}
              >
                TCH
              </th>
              <th
                rowSpan={2}
                style={{
                  position: 'sticky',
                  right: TOTAL_PERCENT_RIGHT,
                  zIndex: 8,
                  background: 'var(--bg-card)',
                  minWidth: TOTAL_PERCENT_WIDTH,
                  maxWidth: TOTAL_PERCENT_WIDTH,
                  width: TOTAL_PERCENT_WIDTH,
                  textAlign: 'center',
                  padding: '10px 8px',
                }}
              >
                %
              </th>
            </tr>
            <tr>
              {visibleDates.flatMap((dateEntry, dateIndex) => (Array.isArray(dateEntry.subjects) ? dateEntry.subjects : []).map((subject, subIndex) => (
                <th
                  key={`${subject.column_key || 'sub'}-${dateIndex}-${subIndex}`}
                  style={{ textAlign: 'center', top: 'auto', position: 'static' }}
                  title={`${subject.subject_name || subject.subject_code || 'Subject'}${subject.period_number ? ` | Period ${subject.period_number}` : ''}`}
                >
                  {formatSubjectHeader(subject)}
                </th>
              ))) }
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              (() => {
                const totals = getRowTotals(row);
                return (
              <tr key={row.user_id}>
                <td
                  style={{
                    position: 'sticky',
                    left: STICKY_ROLL_LEFT,
                    zIndex: 3,
                    background: 'var(--bg-card)',
                    minWidth: 148,
                    pointerEvents: 'auto',
                  }}
                >
                  {row.roll_no}
                </td>
                <td
                  style={{
                    position: 'sticky',
                    left: STICKY_NAME_LEFT,
                    zIndex: 3,
                    background: 'var(--bg-card)',
                    minWidth: 220,
                    pointerEvents: 'auto',
                    textAlign: 'center',
                  }}
                >
                  {row.name}
                </td>
                {visibleDates.flatMap((dateEntry, dateIndex) => (Array.isArray(dateEntry.subjects) ? dateEntry.subjects : []).map((subject, subIndex) => (
                  <td key={`${row.user_id}-${subject.column_key || 'sub'}-${dateIndex}-${subIndex}`} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {(row.cells || {})[subject.column_key] || 'X'}
                  </td>
                )))}
                <td
                  style={{
                    position: 'sticky',
                    right: TOTAL_ATTENDED_RIGHT,
                    zIndex: 4,
                    background: 'var(--bg-card)',
                    minWidth: TOTAL_ATTENDED_WIDTH,
                    maxWidth: TOTAL_ATTENDED_WIDTH,
                    width: TOTAL_ATTENDED_WIDTH,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '10px 8px',
                  }}
                >
                  {totals.totalAttended}
                </td>
                <td
                  style={{
                    position: 'sticky',
                    right: TOTAL_HELD_RIGHT,
                    zIndex: 4,
                    background: 'var(--bg-card)',
                    minWidth: TOTAL_HELD_WIDTH,
                    maxWidth: TOTAL_HELD_WIDTH,
                    width: TOTAL_HELD_WIDTH,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '10px 8px',
                  }}
                >
                  {totals.totalHeld}
                </td>
                <td
                  style={{
                    position: 'sticky',
                    right: TOTAL_PERCENT_RIGHT,
                    zIndex: 4,
                    background: 'var(--bg-card)',
                    minWidth: TOTAL_PERCENT_WIDTH,
                    maxWidth: TOTAL_PERCENT_WIDTH,
                    width: TOTAL_PERCENT_WIDTH,
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '10px 8px',
                  }}
                >
                  {totals.percentage}
                </td>
              </tr>
                );
              })()
            ))}
          </tbody>
        </table>
        </div>
        ) : null}
      </div>
    </div>
  );
}
