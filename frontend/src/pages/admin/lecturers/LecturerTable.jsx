import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClipboardList,
  HiOutlineKey,
  HiOutlineTrash,
  HiOutlineCamera,
  HiOutlineSparkles,
  HiOutlinePencil,
  HiX,
} from 'react-icons/hi';

/**
 * Table body rendering lecturers with row actions. Clicking department badges opens modal with assigned papers.
 */
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
  const [previewImage, setPreviewImage] = useState(null);

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
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {lecturers.map((l) => {
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
                          objectFit: 'cover', cursor: 'pointer'
                        }}
                        onClick={() => setPreviewImage(`/api/admin/lecturers/profile-picture/${l.profile_picture_file}`)}
                        onError={(e) => { e.target.onerror = null; e.target.src = ""; }}
                      />
                    ) : (
                      <div style={{
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
                      }}>
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
                      <HiOutlineKey size={15} />
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
    </div>
  );
}
