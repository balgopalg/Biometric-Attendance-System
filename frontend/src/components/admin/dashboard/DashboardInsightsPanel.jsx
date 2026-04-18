import {
  HiOutlineChartBar,
  HiOutlineOfficeBuilding,
  HiOutlineAcademicCap,
  HiOutlineCalendar,
  HiOutlineFilter,
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineChevronRight,
  HiOutlineUser,
} from 'react-icons/hi';
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
    <div className="glass-card insights-donut-card">
      <div className="insights-card-header">
        <HiOutlineChartBar size={16} style={{ color: 'var(--accent-cyan)' }} />
        <span>Eligibility Ratio</span>
      </div>
      <div className="insights-donut-body">
        <div className="insights-donut-ring">
          <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Eligibility ratio donut chart">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--border-glass)" strokeWidth="14" />
            <circle
              cx="65" cy="65" r={radius} fill="none"
              stroke="var(--accent-emerald)" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${eligibleStroke} ${circumference - eligibleStroke}`}
              transform="rotate(-90 65 65)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <circle
              cx="65" cy="65" r={radius} fill="none"
              stroke="var(--accent-rose)" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${ineligibleStroke} ${circumference - ineligibleStroke}`}
              strokeDashoffset={-eligibleStroke}
              transform="rotate(-90 65 65)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          <div className="insights-donut-center">
            <p className="insights-donut-value">{total}</p>
            <p className="insights-donut-label">Students</p>
          </div>
        </div>

        <div className="insights-donut-legend">
          <div className="insights-legend-row">
            <span className="insights-legend-dot" style={{ background: 'var(--accent-emerald)' }} />
            <span className="insights-legend-text">Eligible</span>
            <b>{eligible}</b>
          </div>
          <div className="insights-bar-track">
            <div className="insights-bar-fill" style={{ width: `${Math.round(eligibleRatio * 100)}%`, background: 'var(--accent-emerald)' }} />
          </div>

          <div className="insights-legend-row">
            <span className="insights-legend-dot" style={{ background: 'var(--accent-rose)' }} />
            <span className="insights-legend-text">Ineligible</span>
            <b>{ineligible}</b>
          </div>
          <div className="insights-bar-track">
            <div className="insights-bar-fill" style={{ width: `${Math.round(ineligibleRatio * 100)}%`, background: 'var(--accent-rose)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionBars({ title, icon, rows, labelKey, valueKey }) {
  const maxValue = rows.reduce((max, row) => Math.max(max, Number(row[valueKey]) || 0), 0) || 1;

  return (
    <div className="glass-card insights-dist-card">
      <div className="insights-card-header">
        {icon}
        <span>{title}</span>
      </div>
      <div className="insights-dist-bars">
        {rows.length === 0 ? (
          <p className="insights-empty-text">No chart data for current filters.</p>
        ) : rows.map((row) => {
          const value = Number(row[valueKey]) || 0;
          const width = value === 0 ? 0 : Math.max(8, Math.round((value / maxValue) * 100));
          return (
            <div key={String(row[labelKey])} className="insights-dist-item">
              <div className="insights-dist-label-row">
                <span>{row[labelKey]}</span>
                <b>{value}</b>
              </div>
              <div className="insights-bar-track">
                <div className="insights-bar-fill insights-bar-gradient" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CascadeStep({ number, label, active }) {
  return (
    <div className={`insights-cascade-step ${active ? 'active' : ''}`}>
      <span className="insights-cascade-num">{number}</span>
      <span className="insights-cascade-label">{label}</span>
      {number < 4 && <HiOutlineChevronRight size={12} className="insights-cascade-arrow" />}
    </div>
  );
}

function DepartmentCard({ name, stats }) {
  return (
    <div className="glass-card insights-course-card">
      <div className="insights-course-name">
        <HiOutlineOfficeBuilding size={15} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <span>{name}</span>
      </div>
      <div className="insights-course-stats">
        <div className="insights-course-stat" title="Total Students">
          <HiOutlineUserGroup size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{stats.students || 0}</span>
        </div>
        <div className="insights-course-stat" title="Total Lecturers" style={{ color: 'var(--accent-amber)' }}>
          <HiOutlineUser size={14} />
          <span>{stats.lecturers || 0}</span>
        </div>
      </div>
    </div>
  );
}

function CourseCard({ course }) {
  return (
    <div className="glass-card insights-course-card">
      <div className="insights-course-name">
        <HiOutlineAcademicCap size={15} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <span>{formatCourseName(course.course_name, { status: course.course_status, isInactive: course.is_course_inactive })}</span>
      </div>
      <div className="insights-course-stats">
        <div className="insights-course-stat">
          <HiOutlineUserGroup size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{course.total_students}</span>
        </div>
        <div className="insights-course-stat eligible">
          <HiOutlineCheckCircle size={14} />
          <span>{course.eligible_count}</span>
        </div>
        <div className="insights-course-stat ineligible">
          <HiOutlineXCircle size={14} />
          <span>{course.ineligible_count}</span>
        </div>
      </div>
    </div>
  );
}

function SemesterCard({ sem }) {
  return (
    <div className="glass-card insights-course-card">
      <div className="insights-course-name">
        <HiOutlineCalendar size={15} style={{ color: 'var(--accent-purple, #8b5cf6)', flexShrink: 0 }} />
        <span>Semester {sem.semester}</span>
      </div>
      <div className="insights-course-stats">
        <div className="insights-course-stat">
          <HiOutlineUserGroup size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{sem.total_students}</span>
        </div>
        <div className="insights-course-stat eligible">
          <HiOutlineCheckCircle size={14} />
          <span>{sem.eligible_count}</span>
        </div>
        <div className="insights-course-stat ineligible">
          <HiOutlineXCircle size={14} />
          <span>{sem.ineligible_count}</span>
        </div>
      </div>
    </div>
  );
}

function StudentBucketColumn({ title, icon, count, students, color }) {
  return (
    <div className="glass-card insights-bucket-card">
      <h4 className="insights-bucket-title" style={{ color }}>
        {icon}
        {title} ({count})
      </h4>
      <div className="insights-bucket-list">
        {students.map((s) => (
          <div key={s.user_id} className="insights-bucket-item">
            <p className="insights-bucket-name">{s.student_name}</p>
            <p className="insights-bucket-meta">{s.reg_number || 'N/A'} · {s.student_email || ''}</p>
          </div>
        ))}
        {students.length === 0 && (
          <p className="insights-empty-text">No {title.toLowerCase()}.</p>
        )}
      </div>
    </div>
  );
}

export default function DashboardInsightsPanel({
  eligibilitySnapshot,
  filters,
  departmentOptions,
  academicSessionOptions,
  courseOptions,
  semesterOptions,
  courseSummary,
  semesterSummary,
  chartRows,
  studentBuckets,
  loadingEligibility,
  departmentsSummary = {},
  isSuperAdmin = false,
  onDepartmentChange,
  onAcademicSessionChange,
  onCourseChange,
  onSemesterChange,
}) {
  // Enforce strict cascade: Department → Course → Academic Session → Semester
  const showCourseDropdown = !!filters.department;
  const showSessionDropdown = !!filters.department && !!filters.course_id;
  const showSemesterDropdown = !!filters.department && !!filters.course_id && !!filters.academic_session;

  const activeStep = !filters.department ? 0
    : !filters.course_id ? 1
    : !filters.academic_session ? 2
    : !filters.semester ? 3
    : 4;

  return (
    <div className="glass-card insights-panel">
      {/* ── Header ── */}
      <div className="insights-panel-header">
        <div className="insights-panel-title">
          <HiOutlineChartBar size={20} style={{ color: 'var(--accent-cyan)' }} />
          <h3>Attendance Summary</h3>
        </div>
        <div className="insights-cascade-steps">
          <CascadeStep number={1} label="Dept" active={activeStep >= 1} />
          <CascadeStep number={2} label="Course" active={activeStep >= 2} />
          <CascadeStep number={3} label="Session" active={activeStep >= 3} />
          <CascadeStep number={4} label="Sem" active={activeStep >= 4} />
        </div>
      </div>

      {/* ── Snapshot cards ── */}
      <div className="insights-snapshot-grid">
        <div className="glass-card insights-snapshot-card">
          <div className="insights-card-header">
            <HiOutlineAcademicCap size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span>Students by Course</span>
          </div>
          {Object.entries(eligibilitySnapshot.students_by_course || {}).length === 0 ? (
            <p className="insights-empty-text">No data</p>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(eligibilitySnapshot.students_by_course || {}).map(([course, count]) => (
                <div key={course} className="insights-snapshot-row">
                  <span>{course}</span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card insights-snapshot-card">
          <div className="insights-card-header">
            <HiOutlineCalendar size={16} style={{ color: 'var(--accent-amber)' }} />
            <span>Students by Academic Year</span>
          </div>
          {Object.entries(eligibilitySnapshot.students_by_year || {}).length === 0 ? (
            <p className="insights-empty-text">No data</p>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(eligibilitySnapshot.students_by_year || {}).map(([year, count]) => (
                <div key={year} className="insights-snapshot-row">
                  <span>Year {year}</span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Cascading Filters ── */}
      <div className="insights-filter-grid">
        <div className="insights-filter-item">
          <label className="insights-filter-label">
            <HiOutlineOfficeBuilding size={13} />
            Department
          </label>
          <select 
            className="input-field" 
            value={filters.department} 
            onChange={(e) => onDepartmentChange(e.target.value)}
            disabled={!isSuperAdmin}
            style={!isSuperAdmin ? { opacity: 0.8, cursor: 'not-allowed', background: 'var(--bg-card-alt)', color: 'var(--text-muted)' } : {}}
          >
            {isSuperAdmin && <option value="">All Departments</option>}
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div className="insights-filter-item">
          <label className="insights-filter-label">
            <HiOutlineAcademicCap size={13} />
            Course
          </label>
          <select
            className="input-field"
            value={filters.course_id}
            onChange={(e) => onCourseChange(e.target.value)}
            disabled={!showCourseDropdown}
            style={!showCourseDropdown ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
          >
            <option value="">All Courses</option>
            {courseOptions.map((course) => (
              <option key={course.course_id || course.course_name} value={course.course_id || ''}>
                {formatCourseName(course.course_name, { status: course.course_status, isInactive: course.is_course_inactive })}
              </option>
            ))}
          </select>
        </div>

        <div className="insights-filter-item">
          <label className="insights-filter-label">
            <HiOutlineCalendar size={13} />
            Academic Session
          </label>
          <select
            className="input-field"
            value={filters.academic_session}
            onChange={(e) => onAcademicSessionChange(e.target.value)}
            disabled={!showSessionDropdown}
            style={!showSessionDropdown ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
          >
            <option value="">All Sessions</option>
            {academicSessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>
        </div>

        <div className="insights-filter-item">
          <label className="insights-filter-label">
            <HiOutlineFilter size={13} />
            Semester
          </label>
          <select
            className="input-field"
            value={filters.semester}
            onChange={(e) => onSemesterChange(e.target.value)}
            disabled={!showSemesterDropdown}
            style={!showSemesterDropdown ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
          >
            <option value="">All Semesters</option>
            {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Content area (conditional on filter state) ── */}
      {!filters.department ? (
        <div>
          <div className="insights-section-header">
            <HiOutlineOfficeBuilding size={16} style={{ color: 'var(--accent-cyan)' }} />
            <h4>All Departments</h4>
          </div>
          <div className="insights-cards-grid">
            {Object.entries(departmentsSummary || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, stats]) => (
              <DepartmentCard key={dept} name={dept} stats={stats} />
            ))}
            {Object.keys(departmentsSummary || {}).length === 0 && (
              <p className="insights-empty-text">No departments found.</p>
            )}
          </div>
        </div>
      ) : !filters.course_id ? (
        <div>
          <div className="insights-section-header">
            <HiOutlineOfficeBuilding size={16} style={{ color: 'var(--accent-cyan)' }} />
            <h4>Department Overview — {filters.department}</h4>
          </div>
          <div className="insights-cards-grid">
            {courseSummary
              .filter((c) => !filters.department || (c.course_department || '').toLowerCase() === filters.department.toLowerCase())
              .map((course) => (
                <CourseCard key={course.course_id || course.course_name} course={course} />
              ))}
            {courseSummary.filter((c) => !filters.department || (c.course_department || '').toLowerCase() === filters.department.toLowerCase()).length === 0 && !loadingEligibility && (
              <p className="insights-empty-text">No courses found for this department.</p>
            )}
          </div>
        </div>
      ) : !filters.academic_session ? (
        <div>
          <div className="insights-section-header">
            <HiOutlineAcademicCap size={16} style={{ color: 'var(--accent-cyan)' }} />
            <h4>Course Overview</h4>
          </div>
          <div className="insights-cards-grid">
            {courseSummary.filter((c) => !filters.course_id || (c.course_id === filters.course_id)).map((course) => (
              <CourseCard key={course.course_id || course.course_name} course={course} />
            ))}
            {courseSummary.length === 0 && !loadingEligibility && (
              <p className="insights-empty-text">No data for selected course. Select an Academic Session to continue.</p>
            )}
          </div>
        </div>
      ) : !filters.semester ? (
        <div>
          <div className="insights-charts-grid">
            <EligibilityDonutChart
              eligible={eligibilitySnapshot.eligible_count}
              ineligible={eligibilitySnapshot.ineligible_count}
            />
            <DistributionBars
              title="Distribution by Semester"
              icon={<HiOutlineChartBar size={16} style={{ color: 'var(--accent-purple, #8b5cf6)' }} />}
              rows={chartRows}
              labelKey="label"
              valueKey="value"
            />
          </div>

          <div className="insights-section-header">
            <HiOutlineCalendar size={16} style={{ color: 'var(--accent-amber)' }} />
            <h4>Semester-wise Summary</h4>
          </div>
          <div className="insights-cards-grid">
            {semesterSummary.filter((x) => x.semester > 0).map((sem) => (
              <SemesterCard key={sem.semester} sem={sem} />
            ))}
            {semesterSummary.filter((x) => x.semester > 0).length === 0 && !loadingEligibility && (
              <p className="insights-empty-text">No semester summary found for selected course.</p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="insights-charts-grid">
            <EligibilityDonutChart
              eligible={eligibilitySnapshot.eligible_count}
              ineligible={eligibilitySnapshot.ineligible_count}
            />
            <DistributionBars
              title="Students Distribution"
              icon={<HiOutlineChartBar size={16} style={{ color: 'var(--accent-purple, #8b5cf6)' }} />}
              rows={chartRows}
              labelKey="label"
              valueKey="value"
            />
          </div>

          <div className="insights-buckets-grid">
            <StudentBucketColumn
              title="Eligible Students"
              icon={<HiOutlineCheckCircle size={16} />}
              count={studentBuckets.eligible.length}
              students={studentBuckets.eligible}
              color="var(--accent-emerald)"
            />
            <StudentBucketColumn
              title="Ineligible Students"
              icon={<HiOutlineXCircle size={16} />}
              count={studentBuckets.ineligible.length}
              students={studentBuckets.ineligible}
              color="var(--accent-rose)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
