import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProfilePreviewModal from '../../../components/ui/ProfilePreviewModal';
import {
  HiOutlineKey,
  HiOutlineLockClosed,
  HiOutlineTrash,
  HiOutlineCamera,
  HiOutlineSparkles,
  HiOutlinePencil,
  HiOutlineClipboardList,
  HiArrowUp,
  HiArrowDown,
} from 'react-icons/hi';

/**
 * Table body rendering lecturers with row actions. Clicking department badges opens modal with assigned papers.
 */

function SortHeader({ label, field, align, sortKey, sortDir, onSort }) {
  return (
    <th
      className="sortable-th"
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}
      onClick={() => onSort(field)}
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
}

export default function LecturerTable({
  lecturers,
  getLecturerDepartmentGroups,
  onViewPapers,
  onAssign,
  onResetPin,
  onResetPassword,
  onEdit,
  onDelete,
  onEnrollFace,
  onTrainFace,
}) {
  const [previewLecturer, setPreviewLecturer] = useState(null);
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

  const sortedLecturers = useMemo(() => {
    if (!sortKey) return lecturers;
    return [...lecturers].sort((a, b) => {
      let aVal = a[sortKey] ?? '';
      let bVal = b[sortKey] ?? '';
      if (sortKey === 'paper_count') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'has_face') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [lecturers, sortKey, sortDir]);


  const handleViewPapers = (lecturer, departmentGroups) => {
    if (onViewPapers) {
      onViewPapers(lecturer, departmentGroups);
    }
  };

  return (
    <div className="table-scroll lecturers-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <SortHeader label="Name" field="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortHeader label="Email" field="email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th>Department</th>
            <SortHeader label="Status" field="has_face" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedLecturers.map((l) => {
            const departmentGroups = getLecturerDepartmentGroups(l);
            return (
              <tr key={l._id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {l.profile_picture_file ? (
                      <img
                        src={`/api/admin/lecturers/profile-picture/${l.profile_picture_file}`}
                        alt={l.name}
                        style={{
                          display: 'block', width: 30, height: 30, minWidth: 30, minHeight: 30,
                          maxWidth: 30, maxHeight: 30, borderRadius: 9999,
                          objectFit: 'cover', cursor: 'pointer',
                          boxShadow: '0 0 0 2px rgba(245,158,11,0.4)',
                          transition: 'box-shadow 0.2s',
                        }}
                        onClick={() => setPreviewLecturer(l)}
                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.8)'}
                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(245,158,11,0.4)'}
                        onError={(e) => { e.target.onerror = null; e.target.src = ""; }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          background: 'var(--gradient-warm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          color: '#fff',
                          flexShrink: 0,
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                          boxShadow: '0 0 0 2px rgba(245,158,11,0.3)',
                        }}
                        onClick={() => setPreviewLecturer(l)}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.7)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(245,158,11,0.3)'; }}
                        title="View profile"
                      >
                        {l.name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{l.name}</span>
                  </div>
                </td>
                <td>{l.email}</td>
                <td style={{ position: 'relative' }}>
                  {departmentGroups.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No department</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {departmentGroups.map((group, groupIndex) => {
                        return (
                          <div key={`${l._id}-dept-${group.department}-${groupIndex}`}>
                            <button
                              type="button"
                              className="badge badge-info"
                              style={{
                                border: '1px solid var(--accent-cyan)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                              }}
                              onClick={() => handleViewPapers(l, departmentGroups)}
                              title="View assigned subjects"
                            >
                              {group.department}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${l.has_face ? 'badge-success' : 'badge-warning'}`}>
                    {l.has_face ? 'Face Ready' : 'No Face'}
                  </span>
                </td>
                <td>
                  <div className="lecturers-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Train Face From Dataset" onClick={() => onTrainFace(l)}>
                      <HiOutlineSparkles size={15} />
                    </button>
                    <button className="icon-btn" title="Enroll Face" onClick={() => onEnrollFace(l)}>
                      <HiOutlineCamera size={15} />
                    </button>
                    <button className="icon-btn" title="Manage Assignments" onClick={() => onAssign(l)}>
                      <HiOutlineClipboardList size={15} />
                    </button>
                    <button className="icon-btn" title="Reset PIN" onClick={() => onResetPin(l._id, l.name)}>
                      <HiOutlineKey size={15} />
                    </button>
                    <button className="icon-btn" title="Reset Password" onClick={() => onResetPassword(l._id, l.name)}>
                      <HiOutlineLockClosed size={15} />
                    </button>
                    <button className="icon-btn" title="Edit" onClick={() => onEdit(l)}>
                      <HiOutlinePencil size={15} />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={() => onDelete(l)}>
                      <HiOutlineTrash size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ProfilePreviewModal
        isOpen={!!previewLecturer}
        onClose={() => setPreviewLecturer(null)}
        imageSrc={previewLecturer?.profile_picture_file
          ? `/api/admin/lecturers/profile-picture/${previewLecturer.profile_picture_file}`
          : null
        }
        name={previewLecturer?.name || ''}
        role="lecturer"
        hasFace={!!previewLecturer?.has_face}
        email={previewLecturer?.email || ''}
        phone={previewLecturer?.mobile_no || null}
        department={previewLecturer
          ? getLecturerDepartmentGroups(previewLecturer).map(g => g.department).join(', ') || null
          : null
        }
        paperCount={previewLecturer?.paper_count != null ? previewLecturer.paper_count : null}
      />
    </div>
  );
}
