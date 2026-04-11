import { HiOutlineClock } from 'react-icons/hi';
import { formatCourseName } from '../../../utils/courseDisplay';

function EligibilityDonutChart({ eligible, ineligible }) {
  const total = eligible + ineligible;
  const safeTotal = total || 1;
  const eligibleRatio = eligible / safeTotal;
  const ineligibleRatio = ineligible / safeTotal;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const eligibleStroke = circumference * eligibleRatio;
  const ineligibleStroke = circumference * ineligibleRatio;

  return (
    <div className="glass-card" style={{ padding: 14 }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 10 }}>Eligibility Ratio</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
          <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Eligibility ratio donut chart">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--border-glass)" strokeWidth="14" />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="var(--accent-emerald)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${eligibleStroke} ${circumference - eligibleStroke}`}
              transform="rotate(-90 65 65)"
            />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="var(--accent-rose)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${ineligibleStroke} ${circumference - ineligibleStroke}`}
              strokeDashoffset={-eligibleStroke}
              transform="rotate(-90 65 65)"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1 }}>{total}</p>
              <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Students</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--accent-emerald)' }}>Eligible</span>
            <b>{eligible}</b>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(eligibleRatio * 100)}%`, height: '100%', background: 'var(--accent-emerald)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--accent-rose)' }}>Ineligible</span>
            <b>{ineligible}</b>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(ineligibleRatio * 100)}%`, height: '100%', background: 'var(--accent-rose)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionBars({ title, rows, labelKey, valueKey }) {
  const maxValue = rows.reduce((max, row) => Math.max(max, Number(row[valueKey]) || 0), 0) || 1;

  return (
    <div className="glass-card" style={{ padding: 14 }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 12 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No chart data for current filters.</p>
        ) : rows.map((row) => {
          const value = Number(row[valueKey]) || 0;
          const width = value === 0 ? 0 : Math.max(8, Math.round((value / maxValue) * 100));
          return (
            <div key={String(row[labelKey])}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>{row[labelKey]}</span>
                <b>{value}</b>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
                <div style={{ width: `${width}%`, height: '100%', background: 'var(--gradient-primary)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardInsightsPanel({
  eligibilitySnapshot,
  filters,
  academicSessionOptions,
  courseOptions,
  semesterOptions,
  courseSummary,
  semesterSummary,
  chartRows,
  studentBuckets,
  loadingEligibility,
  onAcademicSessionChange,
  onCourseChange,
  onSemesterChange,
}) {
  return (
    <div className="glass-card" style={{ padding: 18, marginTop: 10 }}>
      <h3 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: 12 }}>Attendance Summary</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Students by Course</h3>
          {(Object.entries(eligibilitySnapshot.students_by_course || {}).length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</p>
          ) : (
            Object.entries(eligibilitySnapshot.students_by_course || {}).map(([course, count]) => (
              <div key={course} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.82rem' }}>{course}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
              </div>
            ))
          )}
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Students by Academic Year</h3>
          {(Object.entries(eligibilitySnapshot.students_by_year || {}).length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</p>
          ) : (
            Object.entries(eligibilitySnapshot.students_by_year || {}).map(([year, count]) => (
              <div key={year} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.82rem' }}>Year {year}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <select className="input-field" value={filters.academic_session} onChange={(e) => onAcademicSessionChange(e.target.value)}>
          <option value="">Select Academic Session</option>
          {academicSessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
        </select>

        <select className="input-field" value={filters.course_id} onChange={(e) => onCourseChange(e.target.value)} disabled={!filters.academic_session}>
          <option value="">Select Course</option>
          {courseOptions.map((course) => (
            <option key={course.course_id || course.course_name} value={course.course_id || ''}>
              {formatCourseName(course.course_name, { status: course.course_status, isInactive: course.is_course_inactive })}
            </option>
          ))}
        </select>

        <select className="input-field" value={filters.semester} onChange={(e) => onSemesterChange(e.target.value)} disabled={!filters.course_id}>
          <option value="">Select Semester</option>
          {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>
      </div>

      {filters.academic_session && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
          <EligibilityDonutChart
            eligible={eligibilitySnapshot.eligible_count}
            ineligible={eligibilitySnapshot.ineligible_count}
          />
          <DistributionBars
            title={!filters.course_id ? 'Students Distribution by Course' : 'Students Distribution by Semester'}
            rows={chartRows}
            labelKey="label"
            valueKey="value"
          />
        </div>
      )}

      {!filters.academic_session ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Select an academic session to view course-wise attendance summary.</p>
      ) : !filters.course_id ? (
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Course-wise Attendance Summary</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {courseSummary.map((course) => (
              <div key={course.course_id || course.course_name} className="glass-card" style={{ padding: 14 }}>
                <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                  {formatCourseName(course.course_name, { status: course.course_status, isInactive: course.is_course_inactive })}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Total Students: <b>{course.total_students}</b>
                </p>
                <p style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', marginTop: 3 }}>Eligible: {course.eligible_count}</p>
                <p style={{ fontSize: '0.76rem', color: 'var(--accent-rose)' }}>Ineligible: {course.ineligible_count}</p>
              </div>
            ))}
            {courseSummary.length === 0 && !loadingEligibility && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No course summary found for selected session.</p>
            )}
          </div>
        </div>
      ) : !filters.semester ? (
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Semester-wise Attendance Summary</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {semesterSummary.filter((x) => x.semester > 0).map((sem) => (
              <div key={sem.semester} className="glass-card" style={{ padding: 14 }}>
                <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>Semester {sem.semester}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Total Students: <b>{sem.total_students}</b>
                </p>
                <p style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', marginTop: 3 }}>Eligible: {sem.eligible_count}</p>
                <p style={{ fontSize: '0.76rem', color: 'var(--accent-rose)' }}>Ineligible: {sem.ineligible_count}</p>
              </div>
            ))}
            {semesterSummary.filter((x) => x.semester > 0).length === 0 && !loadingEligibility && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No semester summary found for selected course.</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="glass-card" style={{ padding: 14 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: 'var(--accent-emerald)' }}>
              Eligible Students ({studentBuckets.eligible.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {studentBuckets.eligible.map((s) => (
                <div key={s.student_id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.student_name}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'} · {s.student_email || ''}</p>
                </div>
              ))}
              {studentBuckets.eligible.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No eligible students.</p>}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 14 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: 'var(--accent-rose)' }}>
              Ineligible Students ({studentBuckets.ineligible.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {studentBuckets.ineligible.map((s) => (
                <div key={s.student_id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.student_name}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'} · {s.student_email || ''}</p>
                </div>
              ))}
              {studentBuckets.ineligible.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No ineligible students.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
