import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { formatCourseName } from '../../utils/courseDisplay';
import StatsCard from '../../components/ui/StatsCard';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineChartBar, HiOutlineAcademicCap, HiOutlineCalculator, HiOutlineSparkles, HiOutlineBookOpen, HiOutlineCamera } from 'react-icons/hi';
import { useAuth } from '../../hooks/useAuth';
import AcademicCalendarPanel from '../../components/calendar/AcademicCalendarPanel';
import FaceEnrollmentModal from '../../components/admin/FaceEnrollmentModal';

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
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);

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
    if (!location.state?.showWelcome || !user?.name) return;

    const token = String(location.state?.welcomeToken || '');
    const userIdentity = user?._id || user?.email || user?.name || 'student';
    const key = `welcome-toast:${userIdentity}`;
    const alreadyShownToken = window.sessionStorage.getItem(key);
    if (token && alreadyShownToken === token) return;

    toast.success(`Welcome, ${user.name}!`);
    if (token) {
      window.sessionStorage.setItem(key, token);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, user?._id, user?.email, user?.name]);

  const fetchDashboardData = () => {
    setLoadingDashboard(true);
    setDashboardError('');
    Promise.all([
      api.get('/student/attendance'),
      api.get('/student/predictions'),
      api.get('/student/profile'),
    ]).then(([attendanceRes, predictionsRes, profileRes]) => {
      setAttendance(Array.isArray(attendanceRes.data) ? attendanceRes.data : []);
      setPredictions(Array.isArray(predictionsRes.data) ? predictionsRes.data : []);
      setProfile(profileRes.data || null);
    }).catch((err) => {
      setAttendance([]);
      setPredictions([]);
      setProfile(null);
      setDashboardError(err.response?.data?.error || 'Failed to load student dashboard.');
    }).finally(() => setLoadingDashboard(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const safeAttendance = Array.isArray(attendance) ? attendance : [];
  const safePredictions = Array.isArray(predictions) ? predictions : [];

  const lectureStartedPapers = safeAttendance.filter((a) => Number(a.total_classes || 0) > 0);
  const avgPct = lectureStartedPapers.length > 0
    ? Math.round(lectureStartedPapers.reduce((s, a) => s + a.percentage, 0) / lectureStartedPapers.length)
    : null;
  const onTrackCount = lectureStartedPapers.filter((a) => Number(a.percentage || 0) >= 75).length;

  const overallPrediction = safePredictions[0] || null;

  if (loadingDashboard && !profile) {
    return (
      <div className="student-page">
        <StatePanel variant="loading" title="Loading dashboard" description="Preparing attendance summaries and predictions." compact />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="student-page">
        <StatePanel variant="error" title="Unable to load dashboard" description={dashboardError} actionLabel="Retry" onAction={() => window.location.reload()} compact />
      </div>
    );
  }

  return (
    <div className="student-page">
      <section className="glass-card student-hero-card">
        <div className="student-hero-top">
          <div>
            <h1 className="student-hero-title">
              <HiOutlineSparkles size={20} style={{ color: 'var(--accent-cyan)' }} />
              Hey, <span className="gradient-text">{user?.name?.split(' ')[0] || 'Student'}</span> 👋
            </h1>
            <p className="student-hero-subtitle">
              Track your attendance, exam eligibility, and academic performance below.
            </p>
            {!profile?.profile?.has_face && (
              <button
                className="btn-primary"
                onClick={() => setShowEnrollModal(true)}
                style={{ marginTop: 16, padding: '10px 20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}
              >
                <HiOutlineCamera size={18} /> Enroll My Face
              </button>
            )}
          </div>
          <div className="student-hero-badges">
            <span className="badge badge-info">{currentSemester}</span>
            <span className="badge badge-purple">{profile?.course?.code || 'Course N/A'}</span>
            <span className={`badge ${avgPct !== null && avgPct >= 75 ? 'badge-success' : 'badge-warning'}`}>
              {avgPct === null ? 'No Lectures yet' : `Overall ${avgPct}%`}
            </span>
            <span className={`badge ${profile?.profile?.has_face ? 'badge-success' : 'badge-danger'}`}>
              {profile?.profile?.has_face ? '✓ Face Enrolled' : '⚠ Face Pending'}
            </span>
          </div>
        </div>
      </section>

      {isCourseInactive && (
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 20, borderLeft: '3px solid var(--accent-rose)' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-rose)' }}>Course discontinued</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Your course is currently discontinued until further notice. Some actions may remain restricted.
          </p>
        </div>
      )}

      <div className="student-kpi-grid">
        <StatsCard
          icon={HiOutlineChartBar}
          label="Average Attendance"
          value={avgPct === null ? 'No Lectures yet' : `${avgPct}%`}
          color="var(--accent-purple)"
        />
        <StatsCard icon={HiOutlineAcademicCap} label="Enrolled Papers" value={safeAttendance.length} color="var(--accent-cyan)" />
        <StatsCard icon={HiOutlineBookOpen} label="On Track Papers" value={`${onTrackCount}/${lectureStartedPapers.length || safeAttendance.length || 0}`} color="var(--accent-emerald)" />
      </div>

      <section className="glass-card student-section-card">
        <div className="student-section-head">
          <h3>Course Details</h3>
          <p>Academic profile and enrolled paper information</p>
        </div>
        <div className="student-meta-grid">
          {[
            { label: 'Registration No', value: profile?.profile?.reg_number || 'N/A' },
            { label: 'Course', value: formatCourseName(profile?.course?.name || 'N/A', { status: profile?.course_status || profile?.course?.status, isInactive: isCourseInactive }) },
            { label: 'Course Code', value: profile?.course?.code || 'N/A' },
            { label: 'Academic Year', value: profile?.profile?.academic_year || profile?.course?.year || 'N/A' },
            { label: 'Semester', value: currentSemester },
            { label: 'Biometrics', value: profile?.profile?.has_face ? 'Enrolled ✓' : 'Pending Enrollment', accent: profile?.profile?.has_face ? 'var(--accent-emerald)' : 'var(--accent-rose)' },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: '0.88rem', fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>

        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: 18, marginBottom: 10, color: 'var(--text-secondary)' }}>Assigned Papers</h4>
        {assignedPapers.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No papers assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {assignedPapers.map((s) => (
              <span key={s.paper_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)' }}>
                {s.paper_code} · {s.paper_name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Per-paper attendance rings */}
      <div className="student-section-head">
        <h3>Attendance by Paper</h3>
        <p>Each ring shows your current attendance per paper</p>
      </div>
      <div className="student-rings-grid">
        {safeAttendance.map((a) => {
          const pct = a.percentage;
          const hasLectures = Number(a.total_classes || 0) > 0;
          const color = !hasLectures
            ? 'var(--text-muted)'
            : (pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)');
          const deg = hasLectures ? (pct / 100) * 360 : 0;
          return (
            <motion.div key={a.paper_id} whileHover={{ y: -4 }} className="glass-card" style={{ padding: 18, textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>
                <span className="badge badge-info">{a.paper_code || 'Paper'}</span>
              </div>
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
              <p style={{ fontSize: '0.8rem', fontWeight: 700 }}>{a.paper_name}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.attended} / {a.total_classes} classes</p>
              <span className={`badge ${!hasLectures ? 'badge-info' : (pct >= 75 ? 'badge-success' : 'badge-danger')}`} style={{ marginTop: 8 }}>
                {!hasLectures ? 'No Lectures yet' : (pct >= 75 ? 'On Track' : 'At Risk')}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Predictions */}
      <div style={{ marginBottom: 4 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <HiOutlineCalculator size={18} style={{ color: 'var(--accent-amber)' }} /> Predictions
        </h3>
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 14 }}>Combined projection based on all enrolled papers</p>
      </div>
      <div className="student-pred-grid">
        {overallPrediction ? (
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Across All Enrolled Papers</span>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, marginTop: 6 }}>Combined Attendance Projection</p>
              </div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: overallPrediction.current_percentage >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                {overallPrediction.current_percentage}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ width: `${Math.min(overallPrediction.current_percentage, 100)}%`, height: '100%', borderRadius: 999, background: overallPrediction.current_percentage >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', textAlign: 'center' }}>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-amber)' }}>{overallPrediction.classes_needed_for_75}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3 }}>Classes needed for 75%</p>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius)', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', textAlign: 'center' }}>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{overallPrediction.safe_bunks_remaining}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3 }}>Safe bunks remaining</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 20 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Predictions will appear after attendance data is available.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <AcademicCalendarPanel compact />
      </div>

      {showEnrollModal && profile && (
        <FaceEnrollmentModal 
          student={{ ...profile.profile, user_id: user?._id }}
          onClose={() => setShowEnrollModal(false)}
          onSuccess={() => {
            setShowEnrollModal(false);
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
}
