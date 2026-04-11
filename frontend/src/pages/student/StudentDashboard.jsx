import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { formatCourseName } from '../../utils/courseDisplay';
import StatsCard from '../../components/ui/StatsCard';
import { motion } from 'framer-motion';
import { HiOutlineChartBar, HiOutlineAcademicCap, HiOutlineCalculator } from 'react-icons/hi';

function parseSemesterValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;

  const text = String(value).trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function formatSemester(primaryValue, fallbackNumeric = null) {
  const parsedPrimary = parseSemesterValue(primaryValue);
  if (parsedPrimary) return `Semester ${parsedPrimary}`;

  const parsedFallback = parseSemesterValue(fallbackNumeric);
  if (parsedFallback) return `Semester ${parsedFallback}`;

  const raw = primaryValue === null || primaryValue === undefined ? '' : String(primaryValue).trim();
  return raw || 'N/A';
}

function parseSemesterFromPaper(paper) {
  const direct = parseSemesterValue(paper?.semester);
  if (direct) return direct;

  const code = String(paper?.paper_code || '').trim();
  const name = String(paper?.paper_name || '').trim();

  // Handles code patterns like MCA1.1 / BTECH3-2 where first numeric chunk is semester.
  const codeMatch = code.match(/\d+/);
  if (codeMatch) {
    const fromCode = Number(codeMatch[0]);
    if (Number.isFinite(fromCode) && fromCode > 0) return fromCode;
  }

  // Handles text patterns like "Semester 4" in paper names.
  const semMatch = name.match(/sem(?:ester)?\s*(\d+)/i);
  if (semMatch) {
    const fromName = Number(semMatch[1]);
    if (Number.isFinite(fromName) && fromName > 0) return fromName;
  }

  return null;
}

export default function StudentDashboard() {
  const [attendance, setAttendance] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [profile, setProfile] = useState(null);

  const assignedPapers = profile?.papers || profile?.subjects || [];
  const courseStatus = String(profile?.course_status || profile?.course?.status || 'active').toLowerCase();
  const isCourseInactive = courseStatus !== 'active';
  const derivedSemesterFromPapers = assignedPapers
    .map((p) => parseSemesterFromPaper(p))
    .filter((s) => Number.isFinite(s) && s > 0)
    .reduce((max, s) => Math.max(max, s), 0);
  const currentSemester = formatSemester(
    profile?.profile?.current_semester ?? profile?.course?.semester,
    derivedSemesterFromPapers,
  );

  useEffect(() => {
    api.get('/student/attendance').then((r) => setAttendance(r.data)).catch(() => {});
    api.get('/student/predictions').then((r) => setPredictions(r.data)).catch(() => {});
    api.get('/student/profile').then((r) => setProfile(r.data)).catch(() => {});
  }, []);

  const lectureStartedPapers = attendance.filter((a) => Number(a.total_classes || 0) > 0);
  const avgPct = lectureStartedPapers.length > 0
    ? Math.round(lectureStartedPapers.reduce((s, a) => s + a.percentage, 0) / lectureStartedPapers.length)
    : null;

  const overallPrediction = predictions[0] || null;

  return (
    <motion.div className="student-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Welcome, <span className="gradient-text">Student</span></h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Your attendance overview at a glance.</p>
      </div>

      {isCourseInactive && (
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 20, borderLeft: '3px solid var(--accent-rose)' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-rose)' }}>Course discontinued</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Your course is currently discontinued until further notice. Some actions may remain restricted.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatsCard
          icon={HiOutlineChartBar}
          label="Average Attendance"
          value={avgPct === null ? 'No Lectures yet' : `${avgPct}%`}
          color="var(--accent-purple)"
        />
        <StatsCard icon={HiOutlineAcademicCap} label="Enrolled Papers" value={attendance.length} color="var(--accent-cyan)" />
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Course Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Registration No</p>
            <p style={{ fontSize: '0.86rem', fontWeight: 700 }}>{profile?.profile?.reg_number || 'N/A'}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Course</p>
            <p style={{ fontSize: '0.86rem', fontWeight: 700 }}>
              {formatCourseName(profile?.course?.name || 'N/A', { status: profile?.course_status || profile?.course?.status, isInactive: isCourseInactive })}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Course Code</p>
            <p style={{ fontSize: '0.86rem', fontWeight: 700 }}>{profile?.course?.code || 'N/A'}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Academic Year</p>
            <p style={{ fontSize: '0.86rem', fontWeight: 700 }}>{profile?.profile?.academic_year || profile?.course?.year || 'N/A'}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Semester</p>
            <p style={{ fontSize: '0.86rem', fontWeight: 700 }}>{currentSemester}</p>
          </div>
        </div>

        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 16, marginBottom: 10 }}>Assigned Papers</h4>
        {assignedPapers.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No papers assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {assignedPapers.map((s) => (
              <span key={s.paper_id} className="badge badge-info">{s.paper_code} - {s.paper_name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Per-paper attendance rings */}
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Attendance by Paper</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {attendance.map((a) => {
          const pct = a.percentage;
          const hasLectures = Number(a.total_classes || 0) > 0;
          const color = !hasLectures
            ? 'var(--text-muted)'
            : (pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)');
          const deg = hasLectures ? (pct / 100) * 360 : 0;
          return (
            <motion.div key={a.paper_id} whileHover={{ y: -4 }} className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 12px',
                background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.06) ${deg}deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1rem', color,
                }}>{hasLectures ? `${Math.round(pct)}%` : '—'}</div>
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{a.paper_name}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.attended} / {a.total_classes} classes</p>
              <span className={`badge ${!hasLectures ? 'badge-info' : (pct >= 75 ? 'badge-success' : 'badge-danger')}`} style={{ marginTop: 8 }}>
                {!hasLectures ? 'No Lectures yet' : (pct >= 75 ? 'On Track' : 'At Risk')}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Predictions */}
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HiOutlineCalculator size={18} style={{ color: 'var(--accent-amber)' }} /> Overall Predictions
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {overallPrediction ? (
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="badge badge-info">Across All Enrolled Papers</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: overallPrediction.current_percentage >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                {overallPrediction.current_percentage}%
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Combined attendance projection</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 'var(--radius)', background: 'rgba(245, 158, 11, 0.08)', textAlign: 'center' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-amber)' }}>{overallPrediction.classes_needed_for_75}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Overall classes needed for 75%</p>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 'var(--radius)', background: 'rgba(16, 185, 129, 0.08)', textAlign: 'center' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{overallPrediction.safe_bunks_remaining}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Overall safe bunks left</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 20, color: 'var(--text-muted)' }}>
            Predictions will appear after attendance data is available.
          </div>
        )}
      </div>
    </motion.div>
  );
}
