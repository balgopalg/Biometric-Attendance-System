import { useState } from 'react';
import { HiOutlineTrendingUp, HiOutlineTrendingDown, HiOutlineMinus, HiOutlineUsers, HiOutlineCalendar } from 'react-icons/hi';

function getPointRenderKey(point, index) {
  return `${String(point?.key || point?.label || 'pt')}-${index}`;
}

export default function MonthlyAttendanceTrend({
  points,
  isSuperAdmin,
  departmentsList = [],
  trendDepartment,
  onTrendDepartmentChange,
  loading,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [activeMetric, setActiveMetric] = useState('sessions'); // 'sessions' | 'students'

  const W = 620, H = 200;
  const pad = { top: 20, right: 20, bottom: 32, left: 36 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const safePoints = Array.isArray(points) ? points : [];

  const totalSessions = safePoints.reduce((s, p) => s + (Number(p.sessions) || 0), 0);
  const totalStudents = safePoints.reduce((s, p) => s + (Number(p.students) || 0), 0);

  const maxValue = Math.max(...safePoints.map((p) => Number(p[activeMetric]) || 0), 1);
  const latest = Number(safePoints[safePoints.length - 1]?.[activeMetric]) || 0;
  const previous = Number(safePoints[safePoints.length - 2]?.[activeMetric]) || 0;
  const delta = latest - previous;

  const mapped = safePoints.map((point, i) => {
    const x = pad.left + (safePoints.length > 1 ? (i / (safePoints.length - 1)) * iW : iW / 2);
    const ratio = (Number(point[activeMetric]) || 0) / maxValue;
    const y = pad.top + (iH - ratio * iH);
    return {
      ...point,
      x, y,
      value: Number(point[activeMetric]) || 0,
      sessions: Number(point.sessions) || 0,
      students: Number(point.students) || 0,
    };
  });

  const linePath = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = mapped.length > 0
    ? `${linePath} L ${(pad.left + iW).toFixed(1)} ${(pad.top + iH).toFixed(1)} L ${pad.left.toFixed(1)} ${(pad.top + iH).toFixed(1)} Z`
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const METRICS = [
    { key: 'sessions', label: 'Sessions Held', total: totalSessions, icon: HiOutlineCalendar, color: 'var(--accent-cyan)' },
    { key: 'students', label: 'Students Attended', total: totalStudents, icon: HiOutlineUsers, color: 'var(--accent-purple)' },
  ];

  const activeColor = METRICS.find(m => m.key === activeMetric)?.color || 'var(--accent-cyan)';

  return (
    <div className="glass-card" style={{ padding: 20, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        {/* Left: title */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(6,182,212,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {delta > 0
                ? <HiOutlineTrendingUp size={15} style={{ color: 'var(--accent-emerald)' }} />
                : delta < 0
                  ? <HiOutlineTrendingDown size={15} style={{ color: 'var(--accent-rose)' }} />
                  : <HiOutlineMinus size={15} style={{ color: 'var(--text-muted)' }} />
              }
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>Monthly Attendance Trend</p>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Last {safePoints.length || 6} months · click a pill to switch view</p>
        </div>

        {/* Right: dropdown + KPI stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSuperAdmin && (
              <select
                className="input-field"
                style={{ padding: '5px 10px', fontSize: '0.75rem', height: 'auto', minWidth: 140 }}
                value={trendDepartment}
                onChange={(e) => onTrendDepartmentChange?.(e.target.value)}
                disabled={loading}
              >
                <option value="">All Departments</option>
                {departmentsList.map((d) => (
                  <option key={d._id} value={d.name}>{d.name}</option>
                ))}
              </select>
            )}
            {loading && <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>Updating…</span>}
          </div>
          {/* KPI */}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: activeColor }}>
              {METRICS.find(m => m.key === activeMetric)?.total}
            </p>
            <p style={{ fontSize: '0.68rem', fontWeight: 600, marginTop: 3, color: delta > 0 ? 'var(--accent-emerald)' : delta < 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} {Math.abs(delta)} vs prev month
            </p>
          </div>
        </div>
      </div>

      {/* ── 2 KPI Toggle Pills ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {METRICS.map((metric) => {
          const { key, label, total, icon: MetricIcon, color } = metric;
          const isActive = activeMetric === key;
          return (
            <button
              key={key}
              onClick={() => setActiveMetric(key)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${isActive ? color : 'var(--border-glass)'}`,
                background: isActive ? `color-mix(in srgb, ${color} 12%, transparent)` : 'var(--bg-glass)',
                transition: 'all 140ms ease', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <MetricIcon size={16} style={{ color }} />
              </div>
              <div>
                <p style={{ fontSize: '0.62rem', fontWeight: 600, color: isActive ? color : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: isActive ? color : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{total}</p>
              </div>
            </button>
          );
        })}
      </div>

      {safePoints.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '24px 0', textAlign: 'center' }}>
          No data available for the selected period.
        </p>
      ) : (
        <>
          {/* ── Line Chart ── */}
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 320, height: H }} role="img" aria-label="Monthly attendance trend chart">
              <defs>
                <linearGradient id="matAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(6,182,212,0.28)" />
                  <stop offset="85%" stopColor="rgba(139,92,246,0.04)" />
                  <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                </linearGradient>
                <linearGradient id="matLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
                <filter id="matDotGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Y-axis grid + labels */}
              {yTicks.map((tick) => {
                const y = pad.top + tick * iH;
                const val = Math.round(maxValue * (1 - tick));
                return (
                  <g key={tick}>
                    <line x1={pad.left} y1={y} x2={pad.left + iW} y2={y} stroke="var(--border-glass)" strokeDasharray="4 6" strokeWidth="1" />
                    {val > 0 && <text x={pad.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">{val}</text>}
                  </g>
                );
              })}

              <path d={areaPath} fill="url(#matAreaGrad)" />
              <path d={linePath} fill="none" stroke="url(#matLineGrad)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

              {mapped.map((p, i) => {
                const isHov = hoveredIdx === i;
                return (
                  <g key={getPointRenderKey(p, i)}>
                    {isHov && <line x1={p.x} y1={pad.top} x2={p.x} y2={pad.top + iH} stroke="rgba(6,182,212,0.2)" strokeWidth="1" strokeDasharray="3 4" />}
                    {isHov && (() => {
                      const ttH = 44, ttW = 110;
                      const ttX = Math.min(Math.max(p.x - ttW / 2, pad.left), W - ttW - 4);
                      const ttY = Math.max(4, p.y - ttH - 8);
                      const cx = ttX + ttW / 2;
                      return (
                        <g pointerEvents="none">
                          <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={7} fill="rgba(15,23,42,0.94)" stroke="rgba(6,182,212,0.3)" strokeWidth="1" />
                          <text x={cx} y={ttY + 13} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.55)">{p.label}</text>
                          <text x={cx} y={ttY + 27} textAnchor="middle" fontSize="10" fontWeight="700" fill="#06b6d4">
                            {p.sessions} session{p.sessions !== 1 ? 's' : ''}
                          </text>
                          <text x={cx} y={ttY + 39} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)">
                            {p.students} student{p.students !== 1 ? 's' : ''} attended
                          </text>
                        </g>
                      );
                    })()}
                    <circle
                      cx={p.x} cy={p.y}
                      r={isHov ? 6 : 4}
                      fill={isHov ? '#06b6d4' : 'var(--bg-card)'}
                      stroke={isHov ? '#06b6d4' : '#8b5cf6'}
                      strokeWidth="2"
                      style={{ cursor: 'pointer', transition: 'r 120ms ease' }}
                      filter={isHov ? 'url(#matDotGlow)' : undefined}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                    <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10"
                      fontWeight={isHov ? '700' : '500'}
                      fill={isHov ? 'var(--accent-cyan)' : 'var(--text-muted)'}
                    >{p.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ── Mini Bar Chart ── */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-glass)' }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Bar · {METRICS.find(m => m.key === activeMetric)?.label}
            </p>
            <svg viewBox={`0 0 ${W} 76`} style={{ width: '100%', height: 76, display: 'block' }} role="img" aria-label="Monthly attendance bar chart">
              <defs>
                <linearGradient id="matBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              {(() => {
                const bPad = { top: 16, right: 20, bottom: 22, left: 36 }; // Increased top pad for labels
                const bW = W - bPad.left - bPad.right;
                const bH = 76 - bPad.top - bPad.bottom;
                const barW = Math.min(32, Math.max(12, bW / (safePoints.length * 2)));
                return mapped.map((point, i) => {
                  const val = point.value;
                  const barH = Math.max((val / maxValue) * bH, val > 0 ? 3 : 0);
                  const gap = bW / safePoints.length;
                  const x = bPad.left + gap * i + gap / 2 - barW / 2;
                  const y = bPad.top + bH - barH;
                  const isHov = hoveredIdx === i;
                  return (
                    <g key={getPointRenderKey(point, i)} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
                      <rect x={x} y={bPad.top} width={barW} height={bH} rx={4} fill="rgba(255,255,255,0.04)" />
                      <rect x={x} y={y} width={barW} height={barH} rx={4}
                        fill={isHov ? '#06b6d4' : 'url(#matBarGrad)'} opacity={isHov ? 1 : 0.85}
                      />
                      {val > 0 && (
                        <text
                          x={x + barW / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="800"
                          fill={isHov ? 'var(--accent-cyan)' : 'var(--text-primary)'}
                          style={{ transition: 'fill 140ms ease' }}
                        >
                          {val}
                        </text>
                      )}
                      <text x={x + barW / 2} y={76 - 5} textAnchor="middle" fontSize="9"
                        fontWeight={isHov ? '700' : '500'}
                        fill={isHov ? 'var(--accent-cyan)' : 'var(--text-muted)'}
                      >{point.label}</text>
                    </g>
                  );
                });
              })()}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
