import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineClipboardList,
  HiOutlineKey,
  HiOutlineTrash,
  HiOutlineCamera,
  HiOutlineSparkles,
  HiX,
} from 'react-icons/hi';

/**
 * Table body rendering lecturers with department-popover and row actions.
 */
export default function LecturerTable({
  lecturers,
  getLecturerDepartmentGroups,
  openDepartmentPopover,
  openDepartmentWithDefaultCourse,
  activePopoverCourses,
  setActivePopoverCourses,
  getDefaultCourseName,
  onAssign,
  onResetPin,
  onResetPassword,
  onDelete,
  onEnrollFace,
  onTrainFace,
}) {
  const [previewImage, setPreviewImage] = useState(null);
  const [activePopoverAnchor, setActivePopoverAnchor] = useState(null);

  useEffect(() => {
    if (!openDepartmentPopover.lecturerId || !openDepartmentPopover.department) {
      setActivePopoverAnchor(null);
    }
  }, [openDepartmentPopover]);

  const handleDepartmentButtonClick = (event, lecturerId, group) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const popoverKey = `${lecturerId}::${group.department}`;
    const isAlreadyOpen = openDepartmentPopover.lecturerId === lecturerId && openDepartmentPopover.department === group.department;

    if (isAlreadyOpen) {
      setActivePopoverAnchor(null);
      openDepartmentWithDefaultCourse(lecturerId, group);
      return;
    }

    setActivePopoverAnchor({ popoverKey, rect });
    openDepartmentWithDefaultCourse(lecturerId, group);
  };

  const getPopoverStyle = (popoverKey, isOpen) => {
    const baseStyle = {
      minWidth: 260,
      maxWidth: 340,
      maxHeight: 220,
      overflowY: 'auto',
      zIndex: 9999,
      padding: 10,
      borderRadius: 10,
      border: '1px solid var(--border-glass)',
      background: 'var(--bg-card)',
      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.22)',
    };

    if (!isOpen || !activePopoverAnchor || activePopoverAnchor.popoverKey !== popoverKey) {
      return {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        ...baseStyle,
        zIndex: 8,
      };
    }

    const { top, bottom, left } = activePopoverAnchor.rect;
    const viewportWidth = window.innerWidth || 0;
    const maxWidth = 340;
    let fixedLeft = left;
    if (fixedLeft + maxWidth > viewportWidth - 12) {
      fixedLeft = Math.max(12, viewportWidth - maxWidth - 12);
    }

    const availableBelow = window.innerHeight - bottom - 8;
    const availableAbove = top - 8;
    const openAbove = availableBelow < 240 && availableAbove > 240;
    const fixedTop = openAbove ? Math.max(12, top - 8 - 240) : bottom + 8;

    return {
      position: 'fixed',
      top: fixedTop,
      left: fixedLeft,
      ...baseStyle,
    };
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
                        const isOpen = openDepartmentPopover.lecturerId === l._id && openDepartmentPopover.department === group.department;
                        const popoverKey = `${l._id}::${group.department}`;
                        const activeCourseName = activePopoverCourses[popoverKey] || getDefaultCourseName(group.courses);
                        const activeCourse = (group.courses || []).find((course) => course.courseCode === activeCourseName) || group.courses?.[0] || { subjects: [] };
                        return (
                          <div key={`${l._id}-dept-${group.department}-${groupIndex}`} style={{ position: 'relative' }} className="lecturer-dept-popover-surface">
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
                              onClick={(e) => handleDepartmentButtonClick(e, l._id, group)}
                              title={isOpen ? 'Hide assigned subjects' : 'Show assigned subjects'}
                            >
                              {group.department}
                              {isOpen ? <HiOutlineChevronUp size={12} /> : <HiOutlineChevronDown size={12} />}
                            </button>

                            {isOpen ? (
                              <div
                                style={getPopoverStyle(popoverKey, isOpen)}
                              >
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 8 }}>{group.department} - Assigned Subjects</p>
                                {(group.courses || []).length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, rowGap: 8, marginBottom: 10 }}>
                                    {group.courses.map((course, courseIndex) => {
                                      const selected = course.courseCode === activeCourseName;
                                      return (
                                        <button
                                          key={`${popoverKey}-course-${courseIndex}`}
                                          type="button"
                                          onClick={() => {
                                            setActivePopoverCourses((prev) => ({
                                              ...prev,
                                              [popoverKey]: course.courseCode,
                                            }));
                                          }}
                                          style={{
                                            padding: '5px 12px',
                                            borderRadius: 999,
                                            border: selected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                                            background: selected ? 'rgba(34, 211, 238, 0.12)' : 'var(--bg-glass)',
                                            fontSize: '0.74rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {course.courseCode}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null}

                                {(activeCourse.subjects || []).length === 0 ? (
                                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No assigned subjects</p>
                                ) : (
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    {activeCourse.subjects.map((subject, subjectIndex) => (
                                      <div
                                        key={`${l._id}-dept-subject-${group.department}-${subjectIndex}`}
                                        style={{
                                          fontSize: '0.76rem',
                                          padding: '6px 8px',
                                          borderRadius: 8,
                                          border: '1px solid var(--border-glass)',
                                          background: 'var(--bg-glass)',
                                        }}
                                      >
                                        {subject}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null}
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
