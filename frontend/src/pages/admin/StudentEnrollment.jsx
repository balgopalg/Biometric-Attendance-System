import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineCamera, HiOutlineUpload, HiOutlineCheckCircle, HiX } from 'react-icons/hi';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import StatePanel from '../../components/ui/StatePanel';
import { formatCourseName } from '../../utils/courseDisplay';
import { useAuth } from '../../hooks/useAuth';

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text, query) {
  const raw = String(text || '');
  const term = String(query || '').trim();
  if (!term) return raw;

  const matcher = new RegExp(`(${escapeRegExp(term)})`, 'ig');
  const parts = raw.split(matcher);

  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === term.toLowerCase();
    return isMatch ? (
      <span key={`${part}-${index}`} style={{ background: 'rgba(14, 165, 233, 0.2)', borderRadius: 4, padding: '0 2px' }}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

function studentOptionLabel(student) {
  return `${student.name || 'Unknown'} - ${student.reg_number || 'No reg'} - ${formatCourseName(student.course_name || 'N/A', { isInactive: student.is_course_inactive, status: student.course_status })}`;
}

export default function StudentEnrollment() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();

  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filters, setFilters] = useState({ department_id: '', course_id: '', academic_session: '', semester: '' });
  const [sessionOptions, setSessionOptions] = useState([]);
  const [semesterOptions, setSemesterOptions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [pickerText, setPickerText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const fileRef = useRef();
  const pickerRef = useRef();
  const debouncedFilters = useDebouncedValue(filters, 250);

  const activeCourses = useMemo(
    () => courses.filter((c) => String(c.status || 'active').toLowerCase() === 'active'),
    [courses]
  );

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    } else if (isDepartmentAdmin && departmentId && departmentName) {
      setDepartments([{ _id: departmentId, name: departmentName }]);
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  }, [isSuperAdmin, isDepartmentAdmin, departmentId, departmentName]);

  useEffect(() => {
    const params = {};
    if (filters.department_id) params.department_id = filters.department_id;
    api.get('/admin/courses', { params }).then((r) => setCourses(r.data)).catch(() => {});
  }, [filters.department_id]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchStudents = async () => {
      // Dept admins always have department_id set; super admins fetch all by default
      if (isDepartmentAdmin && !debouncedFilters.department_id) {
        setStudents([]);
        setStudentsError('');
        return;
      }
      setLoadingStudents(true);
      setStudentsError('');
      const baseParams = { limit: 500, include_inactive: true };
      if (debouncedFilters.department_id) {
        const dept = departments.find((d) => d._id === debouncedFilters.department_id);
        if (dept) baseParams.department = dept.name;
      }
      if (debouncedFilters.course_id) baseParams.course_id = debouncedFilters.course_id;
      if (debouncedFilters.academic_session) baseParams.academic_session = debouncedFilters.academic_session;
      if (debouncedFilters.semester) baseParams.semester = debouncedFilters.semester;

      try {
        const primary = await api.get('/admin/students/options', { params: baseParams, signal: controller.signal });
        const primaryRows = primary.data || [];
        if (primaryRows.length > 0) {
          setStudents(primaryRows);
          return;
        }

        if (!debouncedFilters.course_id) {
          setStudents(primaryRows);
          return;
        }

        // Only broaden the query when no semester is selected.
        if (debouncedFilters.semester) {
          setStudents(primaryRows);
          return;
        }

        // Fallback: course-only query when session filtering is too restrictive.
        const fallbackParams = { limit: 500, course_id: debouncedFilters.course_id };
        const fallback = await api.get('/admin/students/options', { params: fallbackParams, signal: controller.signal });
        setStudents(fallback.data || []);
      } catch (err) {
        if (err?.code === 'ERR_CANCELED') return;
        setStudents([]);
        setStudentsError(err.response?.data?.error || 'Failed to load student options.');
      } finally {
        if (!controller.signal.aborted) setLoadingStudents(false);
      }
    };

    fetchStudents();

    return () => controller.abort();
  }, [debouncedFilters, isDepartmentAdmin]);

  useEffect(() => {
    if (!filters.course_id) {
      setSessionOptions([]);
      setSemesterOptions([]);
      return;
    }

    api.get(`/admin/courses/${filters.course_id}/sessions`)
      .then((r) => setSessionOptions(r.data || []))
      .catch(() => setSessionOptions([]));

    api.get(`/admin/courses/${filters.course_id}/semesters`)
      .then((r) => setSemesterOptions(r.data || []))
      .catch(() => setSemesterOptions([]));
  }, [filters.course_id]);

  const effectiveSessionOptions = useMemo(() => {
    const values = new Set((sessionOptions || []).map((s) => String(s || '').trim()).filter(Boolean));
    students.forEach((s) => {
      const session = String(s.academic_session || s.academic_year || '').trim();
      if (session) values.add(session);
    });
    return Array.from(values).sort();
  }, [sessionOptions, students]);

  const selectedStudentData = useMemo(
    () => students.find((s) => (s.user_id || s._id) === selectedStudent) || null,
    [students, selectedStudent]
  );

  const pickerStudents = useMemo(() => {
    if (!pickerText.trim()) return students.slice(0, 30);
    const term = normalizeSearchText(pickerText);
    return students
      .filter((s) => normalizeSearchText(studentOptionLabel(s)).includes(term))
      .slice(0, 30);
  }, [students, pickerText]);

  useEffect(() => {
    if (!selectedStudent) return;
    const stillPresent = students.some((s) => (s.user_id || s._id) === selectedStudent);
    if (!stillPresent) setSelectedStudent('');
  }, [students, selectedStudent]);

  useEffect(() => {
    if (!selectedStudentData) {
      if (!pickerOpen) setPickerText('');
      return;
    }
    setPickerText(studentOptionLabel(selectedStudentData));
  }, [selectedStudentData, pickerOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [pickerText, students]);

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(event.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const selectStudentFromPicker = (student) => {
    const id = student.user_id || student._id;
    setSelectedStudent(id);
    setPickerText(studentOptionLabel(student));
    setPickerOpen(false);
  };

  const handlePickerKeyDown = (e) => {
    if (!pickerOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setPickerOpen(true);
      return;
    }

    if (!pickerStudents.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % pickerStudents.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + pickerStudents.length) % pickerStudents.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectStudentFromPicker(pickerStudents[highlightedIndex] || pickerStudents[0]);
    } else if (e.key === 'Escape') {
      setPickerOpen(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleEnroll = async () => {
    if (!selectedStudent || !preview) {
      return toast.error('Select a student and upload a photo');
    }
    if (selectedStudentData?.is_course_inactive) {
      return toast.error('This student is linked to a discontinued course and cannot be enrolled right now.');
    }
    setUploading(true);
    try {
      const res = await api.post('/admin/students/enroll', {
        user_id: selectedStudent,
        photo: preview,
      });
      toast.success(res.data.message || 'Face enrolled!');
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enrollment failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-page" style={{ paddingBottom: 40, overflowX: 'hidden' }}>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Student Face Enrollment</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
          Establish a biometric profile for students by capturing or uploading a high-quality face photo.
        </p>
      </div>

      <div className="filter-bar">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-bold uppercase tracking-wider text-muted px-1">Department</label>
            <select
              className="input-field"
              value={filters.department_id}
              onChange={(e) => {
                setFilters({ department_id: e.target.value, course_id: '', academic_session: '', semester: '' });
                setSelectedStudent('');
              }}
              disabled={isDepartmentAdmin}
            >
              <option value="">
                {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
              </option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-bold uppercase tracking-wider text-muted px-1">Course</label>
            <select
              className="input-field"
              value={filters.course_id}
              onChange={(e) => {
                setFilters({ ...filters, course_id: e.target.value, academic_session: '', semester: '' });
                setSelectedStudent('');
              }}
              disabled={!filters.department_id}
            >
              <option value="">All Courses</option>
              {activeCourses.map((c) => (
                <option key={c._id} value={c._id}>
                  {formatCourseName(c.name, { status: c.status })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-bold uppercase tracking-wider text-muted px-1">Session</label>
            <select
              className="input-field"
              value={filters.academic_session}
              onChange={(e) => {
                setFilters({ ...filters, academic_session: e.target.value });
                setSelectedStudent('');
              }}
              disabled={!filters.course_id}
            >
              <option value="">All Sessions</option>
              {effectiveSessionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] font-bold uppercase tracking-wider text-muted px-1">Semester</label>
            <select
              className="input-field"
              value={filters.semester}
              onChange={(e) => {
                setFilters({ ...filters, semester: e.target.value });
                setSelectedStudent('');
              }}
              disabled={!filters.course_id}
            >
              <option value="">All Semesters</option>
              {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2 relative">
        {/* Overlay states that shouldn't move cards */}
        {loadingStudents && students.length === 0 && (
          <div className="absolute inset-0 z-10 bg-primary/20 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
            <StatePanel variant="loading" title="Loading students" description="Preparing searchable student options." compact />
          </div>
        )}

        {studentsError && (
          <div className="col-span-full mb-4">
            <StatePanel variant="error" title="Unable to load students" description={studentsError} actionLabel="Retry" onAction={() => setFilters({ ...filters })} compact />
          </div>
        )}



        {/* Upload Panel */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Select Student</label>
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <input
                className="input-field"
                value={pickerText}
                onChange={(e) => {
                  setPickerText(e.target.value);
                  setPickerOpen(true);
                  if (selectedStudent) setSelectedStudent('');
                }}
                onFocus={() => setPickerOpen(true)}
                onKeyDown={handlePickerKeyDown}
                placeholder="Type to search and select student..."
              />

              {pickerOpen && (
                <div
                  className="glass-card"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 'calc(100% + 6px)',
                    maxHeight: 260,
                    overflowY: 'auto',
                    zIndex: 20,
                    padding: 6,
                  }}
                >
                  {pickerStudents.length === 0 ? (
                    <p style={{ padding: '8px 10px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>No matching students</p>
                  ) : pickerStudents.map((s, index) => {
                    const sid = s.user_id || s._id;
                    const disabled = Boolean(s.is_course_inactive);
                    const active = index === highlightedIndex;
                    const metaText = `${s.reg_number || 'No reg'} - ${formatCourseName(s.course_name || 'N/A', { isInactive: s.is_course_inactive, status: s.course_status })}`;
                    return (
                      <button
                        key={sid}
                        type="button"
                        disabled={disabled}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!disabled) selectStudentFromPicker(s);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 10px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: active ? 'var(--bg-glass)' : 'transparent',
                          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                          opacity: disabled ? 0.7 : 1,
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {renderHighlightedText(s.name || 'Unknown', pickerText)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {renderHighlightedText(metaText, pickerText)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {students.length === 0 && (
              <p style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                No students found for selected filters.
              </p>
            )}
            {selectedStudentData?.is_course_inactive && (
              <p style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--accent-rose)' }}>
                This student belongs to a course that is now discontinued until further update.
              </p>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed var(--border-glass)',
                borderRadius: 'var(--radius-lg)',
                padding: 40,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                background: preview ? 'transparent' : 'var(--bg-glass)',
                minHeight: 250,
              }}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 'var(--radius)', objectFit: 'cover' }} />
              ) : (
                <>
                  <HiOutlineUpload size={32} style={{ color: 'var(--accent-purple)', marginBottom: 8 }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>Click to upload student photo</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>JPG, PNG — clear frontal face</p>
                </>
              )}
            </div>
            {preview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                <HiX size={18} />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

          <button
            className="btn-primary" onClick={handleEnroll} disabled={uploading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
          >
            <HiOutlineCamera size={16} />
            {uploading ? 'Processing...' : 'Extract & Store Embedding'}
          </button>
        </div>

        {/* Info Panel */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>How it Works</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { step: 1, title: 'Upload Photo', desc: 'Upload a clear frontal photo of the student.' },
              { step: 2, title: 'Face Detection', desc: 'MediaPipe detects and locates the face in the image.' },
              { step: 3, title: 'Embedding Generation', desc: 'FaceNet generates a 512-dimensional face embedding.' },
              { step: 4, title: 'Store to Database', desc: 'The embedding vector is saved to MongoDB for future recognition.' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.72rem', color: '#fff', flexShrink: 0,
                }}>{item.step}</div>
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.title}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
