import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineX } from 'react-icons/hi';
import resolveImageUrl from '../../../utils/resolveImageUrl';

export default function ViewAssignedPapersModal({ isOpen, onClose, lecturer, departmentGroups, getDefaultCourseName }) {
  const [activePopoverCourses, setActivePopoverCourses] = useState({});

  if (!isOpen || !lecturer) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '720px',
            maxHeight: '85vh',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-glass)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '24px',
              borderBottom: '1px solid var(--border-glass)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Close modal"
            >
              <HiOutlineX size={24} />
            </button>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px', paddingRight: '32px' }}>
              <span className="gradient-text">Assigned Papers</span>
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Papers assigned to this lecturer
            </p>
          </div>

          {/* Lecturer Details */}
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Lecturer Avatar */}
              <div>
                {lecturer.profile_picture_file ? (
                  <img
                    src={resolveImageUrl(`/api/auth/profile-picture/${lecturer.profile_picture_file}`)}
                    alt={lecturer.name}
                    style={{
                      display: 'block',
                      width: 72,
                      height: 72,
                      minWidth: 72,
                      minHeight: 72,
                      borderRadius: 'var(--radius-md)',
                      objectFit: 'cover',
                      border: '2px solid var(--border-glass)',
                    }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--gradient-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      color: '#fff',
                      border: '2px solid var(--border-glass)',
                    }}
                  >
                    {lecturer.name?.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Lecturer Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  {lecturer.name}
                </h3>
                <div style={{ display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
                      EMAIL
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{lecturer.email}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
                      DEPARTMENT
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{lecturer.department || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Papers/Subjects List */}
          <div style={{ padding: '24px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {departmentGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>No papers assigned to this lecturer</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {departmentGroups.map((group, groupIndex) => {
                  const popoverKey = `${lecturer._id}::${group.department}`;
                  const activeCourseName =
                    activePopoverCourses[popoverKey] || getDefaultCourseName(group.courses);
                  const activeCourse =
                    (group.courses || []).find((course) => course.courseCode === activeCourseName) ||
                    group.courses?.[0] ||
                    { subjects: [] };

                  return (
                    <div
                      key={`dept-group-${groupIndex}`}
                      style={{
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Department Title */}
                      <h4
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          marginBottom: '12px',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {group.department}
                      </h4>

                      {/* Course Tabs */}
                      {(group.courses || []).length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            marginBottom: '16px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {group.courses.map((course, courseIndex) => {
                            const selected = course.courseCode === activeCourseName;
                            return (
                              <motion.button
                                key={`course-tab-${courseIndex}`}
                                type="button"
                                onClick={() => {
                                  setActivePopoverCourses((prev) => ({
                                    ...prev,
                                    [popoverKey]: course.courseCode,
                                  }));
                                }}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '8px',
                                  border: selected
                                    ? '1px solid var(--accent-cyan)'
                                    : '1px solid var(--border-glass)',
                                  background: selected
                                    ? 'rgba(6, 182, 212, 0.15)'
                                    : 'var(--bg-glass)',
                                  fontSize: '0.85rem',
                                  fontWeight: selected ? 700 : 600,
                                  cursor: 'pointer',
                                  color: selected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  whiteSpace: 'nowrap',
                                  boxShadow: selected ? '0 4px 12px rgba(6, 182, 212, 0.1)' : 'none'
                                }}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                {course.courseCode}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}

                      {/* Subjects Grid */}
                      {(activeCourse.subjects || []).length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px 0' }}>
                          No subjects in this course
                        </p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                          {activeCourse.subjects.map((subject, subjectIndex) => (
                            <motion.div
                              whileHover={{ scale: 1.02, y: -2 }}
                              key={`subject-${subjectIndex}`}
                              style={{
                                padding: '12px 16px',
                                background: 'linear-gradient(145deg, var(--bg-secondary), var(--bg-glass))',
                                border: '1px solid var(--border-glass)',
                                borderRadius: '10px',
                                fontSize: '0.85rem',
                                color: 'var(--text-primary)',
                                fontWeight: 600,
                                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }} />
                                {subject}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-glass)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onClose}
              className="btn-secondary"
              style={{
                minWidth: '100px',
              }}
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
