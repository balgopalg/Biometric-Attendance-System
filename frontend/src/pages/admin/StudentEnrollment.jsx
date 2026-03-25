import { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineCamera, HiOutlineUpload, HiOutlineCheckCircle } from 'react-icons/hi';

export default function StudentEnrollment() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filters, setFilters] = useState({ course_id: '', academic_session: '', semester: '' });
  const [sessionOptions, setSessionOptions] = useState([]);
  const [semesterOptions, setSemesterOptions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = {};
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.academic_session) params.academic_session = filters.academic_session;
    if (filters.semester) params.semester = filters.semester;
    api.get('/admin/students', { params }).then((r) => setStudents(r.data)).catch(() => {});
  }, [filters.course_id, filters.academic_session, filters.semester]);

  useEffect(() => {
    if (!filters.course_id) {
      setSessionOptions([]);
      setSemesterOptions([]);
      return;
    }

    api.get('/admin/students', { params: { course_id: filters.course_id } })
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : [];
        const sessions = Array.from(new Set(rows.map((s) => s.academic_session).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
        setSessionOptions(sessions);
      })
      .catch(() => setSessionOptions([]));

    api.get(`/admin/courses/${filters.course_id}/semesters`)
      .then((r) => setSemesterOptions(r.data || []))
      .catch(() => setSemesterOptions([]));
  }, [filters.course_id]);

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.08)' } }} />

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Face Enrollment</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Upload a student photo to extract and store their face embedding.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <select
          className="input-field"
          value={filters.course_id}
          onChange={(e) => {
            setFilters({ course_id: e.target.value, academic_session: '', semester: '' });
            setSelectedStudent('');
          }}
        >
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

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
          {sessionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Upload Panel */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Select Student</label>
            <select className="input-field" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
              <option value="">Choose a student...</option>
              {students.map((s) => (
                <option key={s.user_id || s._id} value={s.user_id || s._id}>
                  {s.name || 'Unknown'} — {s.reg_number || s.roll_number || 'No reg'}
                </option>
              ))}
            </select>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border-glass)',
              borderRadius: 'var(--radius-lg)',
              padding: 40,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s',
              background: preview ? 'transparent' : 'var(--bg-glass)',
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
    </motion.div>
  );
}
