import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCourseName } from '../../../utils/courseDisplay';
import SoftLockWrapper from '../../../components/ui/SoftLockWrapper';
import Pagination from '../../../components/ui/Pagination';
import StatePanel from '../../../components/ui/StatePanel';
import {
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineTrash,
  HiOutlineKey,
  HiOutlinePencil,
  HiOutlineSparkles,
  HiX,
  HiArrowUp,
  HiArrowDown,
} from 'react-icons/hi';

import { useStudentContext } from './StudentContext';

export default function StudentTable() {
  const {
    loadingStudents, studentsError, filtered, filters, setFilters,
    areAllFilteredStudentsSelected, setSelectedStudentIds, selectedStudentIds,
    trainingStudentId, page, totalStudents, fetchStudents,
    handleTrainFace, handleManageStudentPapers, openEdit,
    handleResetPassword, handleFaceEnroll, handleDelete,
    pageSize, setPageSize,
  } = useStudentContext();

  const [previewImage, setPreviewImage] = useState(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortKey === 'enrolled_papers_count') {
        aVal = (a.enrolled_papers || []).length;
        bVal = (b.enrolled_papers || []).length;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'current_semester') {
        aVal = Number(a.current_semester) || 0;
        bVal = Number(b.current_semester) || 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'has_face') {
        aVal = a.has_face ? 1 : 0;
        bVal = b.has_face ? 1 : 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      aVal = String(a[sortKey] ?? '').toLowerCase();
      bVal = String(b[sortKey] ?? '').toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const SortHeader = ({ label, field, align }) => (
    <th
      className="sortable-th"
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}
      onClick={() => handleSort(field)}
      title={`Sort by ${label}`}
    >
      <span className="sort-header-inner">
        {label}
        <span className={`sort-icon ${sortKey === field ? 'sort-icon--active' : ''}`}>
          {sortKey === field
            ? (sortDir === 'asc' ? <HiArrowUp size={12} /> : <HiArrowDown size={12} />)
            : <HiArrowUp size={12} />}
        </span>
      </span>
    </th>
  );

  return (
    <>
      <div className="glass-card">
        {loadingStudents ? (
          <StatePanel variant="loading" title="Loading students" description="Fetching student records and enrollment status." compact />
        ) : null}

        {studentsError ? (
          <StatePanel variant="error" title="Unable to load students" description={studentsError} actionLabel="Retry" onAction={() => setFilters({ ...filters })} compact />
        ) : null}

        {!loadingStudents && !studentsError && filtered.length === 0 ? (
          <StatePanel variant="empty" title="No students found" description="Try adjusting filters or add a new student." compact />
        ) : null}

        {!loadingStudents && !studentsError && filtered.length > 0 ? (
        <div className="table-scroll students-table-scroll">
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
              <SortHeader label="Reg No." field="reg_number" />
              <SortHeader label="Name" field="name" />
              <SortHeader label="Email" field="email" />
              <SortHeader label="Mobile" field="mobile_no" />
              <SortHeader label="Current Sem" field="current_semester" />
              <SortHeader label="Course / Session" field="course_name" />
              <SortHeader label="Papers" field="enrolled_papers_count" />
              <SortHeader label="Status" field="has_face" align="center" />
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((s) => (
              <tr key={s._id} className={s.is_course_inactive ? 'faded-entity' : ''}>
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
                    {s.profile_picture_file ? (
                      <img
                        src={`/api/admin/students/profile-picture/${s.profile_picture_file}`}
                        alt={s.name}
                        style={{
                          display: 'block', width: 30, height: 30, minWidth: 30, minHeight: 30,
                          maxWidth: 30, maxHeight: 30, borderRadius: 9999,
                          objectFit: 'cover', cursor: 'pointer'
                        }}
                        onClick={() => setPreviewImage(`/api/admin/students/profile-picture/${s.profile_picture_file}`)}
                        onError={(e) => { e.target.onerror = null; e.target.src = ""; }} // Fallback if image fails
                      />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'var(--gradient-cool)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.7rem', color: '#fff', flexShrink: 0,
                      }}>
                        {s.name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                </td>
                <td>{s.email}</td>
                <td>{s.mobile_no || 'N/A'}</td>
                <td>{s.current_semester ? `Semester ${s.current_semester}` : 'N/A'}</td>
                <td>{s.course_name ? `${formatCourseName(s.course_name, { isInactive: s.is_course_inactive })} · ${s.academic_session || 'N/A'}` : 'N/A'}</td>
                <td>{(s.enrolled_papers || []).length}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${s.has_face ? 'badge-success' : 'badge-warning'}`}>
                    {s.has_face ? 'Face Ready' : 'No Face'}
                  </span>
                </td>
                <td>
                  <SoftLockWrapper locked={s.is_course_inactive} title="Locked: course inactive">
                    <div className="students-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Train Face From Dataset'} onClick={() => handleTrainFace(s)} disabled={s.is_course_inactive || trainingStudentId === (s.user_id || s._id)}>
                        <HiOutlineSparkles size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Enroll Face'} onClick={() => handleFaceEnroll(s)} disabled={s.is_course_inactive}>
                        <HiOutlineCamera size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Manage Subjects'} onClick={() => handleManageStudentPapers(s)} disabled={s.is_course_inactive}>
                        <HiOutlineClipboardList size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Edit'} onClick={() => openEdit(s)} disabled={s.is_course_inactive}>
                        <HiOutlinePencil size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Reset Password'} onClick={() => handleResetPassword(s)} disabled={s.is_course_inactive}>
                        <HiOutlineKey size={15} />
                      </button>
                      <button className="icon-btn danger" title={s.is_course_inactive ? 'Locked: course inactive' : 'Delete'} onClick={() => handleDelete(s)} disabled={s.is_course_inactive}>
                        <HiOutlineTrash size={15} />
                      </button>
                    </div>
                  </SoftLockWrapper>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span>Show</span>
          <select 
            value={pageSize} 
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              fetchStudents(1); // Reset to page 1 when page size changes
            }}
            className="input-field"
            style={{ padding: '2px 8px', width: 'auto', height: 'auto', minHeight: 'unset' }}
          >
            <option value={10}>10 records</option>
            <option value={20}>20 records</option>
            <option value={50}>50 records</option>
          </select>
        </div>
        <div style={{ marginTop: -16 }}>
          <Pagination page={page} total={totalStudents} perPage={pageSize} onPageChange={fetchStudents} />
        </div>
      </div>

      <AnimatePresence>
        {previewImage && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20
            }}
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'relative',
                width: 300,
                height: 400,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                border: '4px solid rgba(255,255,255,0.1)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage}
                alt="Profile Preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <button
                onClick={() => setPreviewImage(null)}
                style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 2001
                }}
              >
                <HiX size={18} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
