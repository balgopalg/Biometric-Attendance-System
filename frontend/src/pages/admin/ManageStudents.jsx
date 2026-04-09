import { useMemo, useState, useEffect } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import FaceEnrollmentModal from '../../components/admin/FaceEnrollmentModal';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineTrash,
  HiOutlineKey,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlinePencil,
  HiOutlineArrowUp,
} from 'react-icons/hi';

const EMPTY_FORM = {
  name: '',
  email: '',
  course_id: '',
  mobile_no: '',
};

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [papers, setPapers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);

  const [createdCreds, setCreatedCreds] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [enrollingStudent, setEnrollingStudent] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ course_id: '', paper_id: '', semester: '' });
  const [filterSemesters, setFilterSemesters] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [bulkForm, setBulkForm] = useState({ course_id: '', semester: '', paper_id: '', student_ids: [] });
  const [bulkSemesters, setBulkSemesters] = useState([]);
  const [bulkPapers, setBulkPapers] = useState([]);
  const [bulkStudents, setBulkStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const fetchMetadata = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
    api.get('/admin/papers').then((r) => setPapers(r.data)).catch(() => {});
  };

  const fetchStudents = () => {
    const params = {};
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.paper_id) params.paper_id = filters.paper_id;
    if (filters.semester) params.semester = filters.semester;
    api.get('/admin/students', { params }).then((r) => setStudents(r.data)).catch(() => {});
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [filters.course_id, filters.paper_id, filters.semester]);

  useEffect(() => {
    let cancelled = false;
    if (!filters.course_id) {
      setFilterSemesters([]);
      return () => {
        cancelled = true;
      };
    }

    api.get(`/admin/courses/${filters.course_id}/semesters`)
      .then((r) => {
        if (!cancelled) setFilterSemesters(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setFilterSemesters([]);
      });

    return () => {
      cancelled = true;
    };
  }, [filters.course_id]);

  useEffect(() => {
    let cancelled = false;
    if (!showBulk) return () => {
      cancelled = true;
    };
    if (!bulkForm.course_id) {
      setBulkSemesters([]);
      return () => {
        cancelled = true;
      };
    }

    api.get(`/admin/courses/${bulkForm.course_id}/semesters`)
      .then((r) => {
        if (!cancelled) setBulkSemesters(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setBulkSemesters([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showBulk, bulkForm.course_id]);

  useEffect(() => {
    let cancelled = false;
    if (!showBulk) return () => {
      cancelled = true;
    };

    if (!bulkForm.course_id || !bulkForm.semester) {
      setBulkPapers([]);
      setBulkStudents([]);
      return () => {
        cancelled = true;
      };
    }

    api.get('/admin/papers', { params: { course_id: bulkForm.course_id, semester: bulkForm.semester } })
      .then((r) => {
        if (!cancelled) setBulkPapers(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setBulkPapers([]);
      });

    api.get('/admin/students', { params: { course_id: bulkForm.course_id, semester: bulkForm.semester } })
      .then((r) => {
        if (!cancelled) setBulkStudents(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setBulkStudents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showBulk, bulkForm.course_id, bulkForm.semester]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) =>
      s.name?.toLowerCase().includes(q)
      || s.email?.toLowerCase().includes(q)
      || s.reg_number?.toLowerCase().includes(q)
    );
  }, [students, search]);

  const subjectOptions = useMemo(() => {
    return papers.filter((p) => {
      const sameCourse = !filters.course_id || p.course_id === filters.course_id;
      const sameSemester = !filters.semester || String(p.semester || '') === String(filters.semester);
      return sameCourse && sameSemester;
    });
  }, [papers, filters.course_id, filters.semester]);

  useEffect(() => {
    const visibleIds = new Set(filtered.map((s) => s.user_id || s._id));
    setSelectedStudentIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filtered]);

  const areAllBulkStudentsSelected = bulkStudents.length > 0 && bulkStudents.every((s) => {
    const sid = s.user_id || s._id;
    return bulkForm.student_ids.includes(sid);
  });

  const areAllFilteredStudentsSelected = filtered.length > 0 && filtered.every((s) => {
    const sid = s.user_id || s._id;
    return selectedStudentIds.includes(sid);
  });

  const handleAdd = async () => {
    // Validate required fields
    if (!form.name?.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!form.course_id?.trim()) {
      toast.error('Please select a course');
      return;
    }

    try {
      const res = await api.post('/admin/students', form);
      const data = res.data;

      setShowAdd(false);
      setForm(EMPTY_FORM);
      setCreatedCreds({
        reg_number: data.profile?.reg_number || data.profile?.roll_number || 'N/A',
        temp_password: data.temp_password,
        name: data.name,
      });
      setShowCreds(true);
      fetchStudents();
    } catch (err) {
      console.error('Student creation error:', err.response?.data, err.message);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create student';
      toast.error(errorMsg);
    }
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setForm({
      name: student.name || '',
      email: student.email || '',
      course_id: student.course_id || '',
      mobile_no: student.mobile_no || '',
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingStudent) return;
    
    // Validate required fields
    if (!form.name?.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!form.course_id?.trim()) {
      toast.error('Please select a course');
      return;
    }

    try {
      const sid = editingStudent.user_id || editingStudent._id;
      await api.put(`/admin/students/${sid}`, form);
      toast.success('Student updated');
      setShowEdit(false);
      setEditingStudent(null);
      setForm(EMPTY_FORM);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update student');
    }
  };

  const handleDelete = async (student) => {
    const sid = student.user_id || student._id;
    if (!window.confirm('Delete this student?')) return;
    try {
      await api.delete(`/admin/students/${sid}`);
      toast.success('Deleted');
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleResetPassword = async (student) => {
    const sid = student.user_id || student._id;
    if (!window.confirm(`Reset password for ${student.name}?`)) return;
    try {
      const res = await api.post(`/admin/students/${sid}/reset-password`);
      setCreatedCreds({
        reg_number: student.reg_number || student.name,
        temp_password: res.data.temp_password,
        name: student.name,
        isReset: true,
      });
      setShowCreds(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleFaceEnroll = (student) => {
    setEnrollingStudent(student);
    setShowFaceEnroll(true);
  };

  const handleFaceEnrollSuccess = () => {
    setShowFaceEnroll(false);
    setEnrollingStudent(null);
    fetchStudents();
  };

  const handleBulkAssign = async () => {
    if (!bulkForm.paper_id || bulkForm.student_ids.length === 0) {
      toast.error('Select subject and at least one student');
      return;
    }
    try {
      await api.post('/admin/papers/bulk-assign', bulkForm);
      toast.success('Students assigned to subject');
      setShowBulk(false);
      setBulkForm({ course_id: '', semester: '', paper_id: '', student_ids: [] });
      setBulkSemesters([]);
      setBulkPapers([]);
      setBulkStudents([]);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enrollment failed');
    }
  };

  const handlePromoteSelected = async () => {
    if (selectedStudentIds.length === 0) {
      toast.error('Select at least one student to promote');
      return;
    }

    if (!window.confirm(`Promote ${selectedStudentIds.length} selected students to next semester?`)) {
      return;
    }

    try {
      const fromSemester = Number(filters.semester || 0) || undefined;
      const res = await api.post('/admin/student-bulk-promote', {
        student_ids: selectedStudentIds,
        from_semester: fromSemester,
      });
      toast.success(res.data?.message || 'Students promoted');
      setSelectedStudentIds([]);
      fetchStudents();
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 405) {
        toast.error('Bulk promote endpoint not active. Please restart backend server once.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to promote students');
      }
    }
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const text = `${createdCreds.isReset ? 'Name' : 'Reg No'}: ${createdCreds.reg_number}\nTemp Password: ${createdCreds.temp_password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied');
  };

  const StudentModalBody = ({ onSubmit, submitLabel }) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
          <input className="input-field" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
          <input className="input-field" placeholder="student@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course</label>
          <select className="input-field" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
            <option value="">Select course</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Mobile No (Optional)</label>
          <input className="input-field" placeholder="10-digit mobile number (optional)" value={form.mobile_no} onChange={(e) => setForm({ ...form, mobile_no: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={() => { setShowAdd(false); setShowEdit(false); }}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Students</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{students.length} students in current filter</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handlePromoteSelected} disabled={selectedStudentIds.length === 0}>
            <HiOutlineArrowUp size={16} /> Promote Selected ({selectedStudentIds.length})
          </button>
          <button className="btn-secondary" onClick={() => {
            setBulkForm({ course_id: '', semester: '', paper_id: '', student_ids: [] });
            setBulkSemesters([]);
            setBulkPapers([]);
            setBulkStudents([]);
            setShowBulk(true);
          }}>
            <HiOutlineClipboardList size={16} /> Bulk Assign Subject
          </button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
            <HiOutlinePlus size={16} /> Add Student
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            placeholder="Search by name, reg no, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="input-field"
          value={filters.course_id}
          onChange={(e) => setFilters({ course_id: e.target.value, semester: '', paper_id: '' })}
        >
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

        <select
          className="input-field"
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value, paper_id: '' })}
          disabled={!filters.course_id}
        >
          <option value="">All Semesters</option>
          {filterSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>

        <select
          className="input-field"
          value={filters.paper_id}
          onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}
          disabled={!filters.course_id || !filters.semester}
        >
          <option value="">All Subjects</option>
          {subjectOptions.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>

      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={areAllFilteredStudentsSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedStudentIds(filtered.map((s) => s.user_id || s._id));
                    } else {
                      setSelectedStudentIds([]);
                    }
                  }}
                />
              </th>
              <th>Reg No.</th>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Current Sem</th>
              <th>Course / Session</th>
              <th>Papers</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s._id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(s.user_id || s._id)}
                    onChange={(e) => {
                      const sid = s.user_id || s._id;
                      if (e.target.checked) {
                        setSelectedStudentIds((prev) => [...new Set([...prev, sid])]);
                      } else {
                        setSelectedStudentIds((prev) => prev.filter((id) => id !== sid));
                      }
                    }}
                  />
                </td>
                <td><span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--gradient-cool)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      color: '#fff',
                      flexShrink: 0,
                    }}>
                      {s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                </td>
                <td>{s.email}</td>
                <td>{s.mobile_no || 'N/A'}</td>
                <td>{s.current_semester ? `Semester ${s.current_semester}` : 'N/A'}</td>
                <td>{s.course_name ? `${s.course_name} · ${s.academic_session || 'N/A'}` : 'N/A'}</td>
                <td>{(s.enrolled_papers || []).length}</td>
                <td>
                  <span className={`badge ${s.has_face ? 'badge-success' : 'badge-warning'}`}>
                    {s.has_face ? 'Face Ready' : 'No Face'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(s)}>
                      <HiOutlinePencil size={15} />
                    </button>
                    <button className="icon-btn" title="Reset Password" onClick={() => handleResetPassword(s)}>
                      <HiOutlineKey size={15} />
                    </button>
                    <button className="icon-btn" title="Enroll Face" onClick={() => handleFaceEnroll(s)}>
                      <HiOutlineCamera size={15} />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(s)}>
                      <HiOutlineTrash size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No students found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Student" width={560}>
        {StudentModalBody({ onSubmit: handleAdd, submitLabel: 'Create Student' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Student" width={560}>
        {StudentModalBody({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>

      <Modal isOpen={showCreds} onClose={() => setShowCreds(false)} title="" width={460}>
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {createdCreds?.isReset ? 'Password Reset' : 'Student Created'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Share these credentials securely.
          </p>

          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: 16,
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {createdCreds?.isReset ? 'Name:' : 'Reg No:'}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{createdCreds?.isReset ? createdCreds?.name : createdCreds?.reg_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Temp Password:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'monospace' }}>
                {createdCreds?.temp_password}
              </span>
            </div>
          </div>

          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={copyCredentials}>
            <HiOutlineClipboardCopy size={16} /> Copy credentials
          </button>
        </div>
      </Modal>

      <Modal isOpen={showBulk} onClose={() => setShowBulk(false)} title="Bulk Assign Subject" width={520}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 1: Course</label>
          <select
            className="input-field"
            value={bulkForm.course_id}
            onChange={(e) => setBulkForm({ course_id: e.target.value, semester: '', paper_id: '', student_ids: [] })}
          >
            <option value="">Select course</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 2: Semester</label>
          <select
            className="input-field"
            value={bulkForm.semester}
            onChange={(e) => setBulkForm({ ...bulkForm, semester: e.target.value, paper_id: '', student_ids: [] })}
            disabled={!bulkForm.course_id}
          >
            <option value="">Select semester</option>
            {bulkSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 3: Subject</label>
          <select
            className="input-field"
            value={bulkForm.paper_id}
            onChange={(e) => setBulkForm({ ...bulkForm, paper_id: e.target.value })}
            disabled={!bulkForm.semester}
          >
            <option value="">Select subject</option>
            {bulkPapers.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 4: Eligible Students</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              disabled={bulkStudents.length === 0}
              checked={areAllBulkStudentsSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setBulkForm({ ...bulkForm, student_ids: bulkStudents.map((s) => s.user_id || s._id) });
                } else {
                  setBulkForm({ ...bulkForm, student_ids: [] });
                }
              }}
            />
            Select All
          </label>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
            {bulkStudents.map((s) => {
              const sid = s.user_id || s._id;
              return (
                <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={bulkForm.student_ids.includes(sid)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...bulkForm.student_ids, sid]
                        : bulkForm.student_ids.filter((id) => id !== sid);
                      setBulkForm({ ...bulkForm, student_ids: ids });
                    }}
                  />
                  {s.name} ({s.reg_number || 'N/A'})
                </label>
              );
            })}
            {bulkStudents.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 6px' }}>
                Select course and semester to load eligible students.
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowBulk(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleBulkAssign}>Assign</button>
        </div>
      </Modal>

      {showFaceEnroll && enrollingStudent && (
        <FaceEnrollmentModal
          student={enrollingStudent}
          onClose={() => setShowFaceEnroll(false)}
          onSuccess={handleFaceEnrollSuccess}
        />
      )}
    </motion.div>
  );
}
