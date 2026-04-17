import { motion } from 'framer-motion';

function AttendanceBars({ points, maxValue, width, height }) {
  const padding = { top: 8, right: 10, bottom: 24, left: 10 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barWidth = points.length > 0 ? Math.max(10, innerWidth / (points.length * 1.6)) : 10;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} role="img" aria-label="Monthly attendance bar chart">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const y = padding.top + tick * innerHeight;
        return (
          <line
            key={String(tick)}
            x1={padding.left}
            y1={y}
            x2={padding.left + innerWidth}
            y2={y}
            stroke="var(--border-glass)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        );
      })}

      {points.map((point, index) => {
        const value = Number(point.total) || 0;
        const ratio = value / maxValue;
        const barHeight = ratio * innerHeight;
        const gap = innerWidth / points.length;
        const x = padding.left + (gap * index) + (gap / 2) - (barWidth / 2);
        const y = padding.top + innerHeight - barHeight;

        return (
          <g key={point.key}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(0, barHeight)}
              rx="6"
              fill="url(#attendanceBarGradient)"
            />
            <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{point.label}</text>
            <title>{`${point.label}: ${value}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export default function MonthlyAttendanceTrend({ points }) {
  const width = 620;
  const height = 210;
  const padding = { top: 16, right: 16, bottom: 26, left: 16 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...points.map((p) => Number(p.total) || 0), 1);

  const mapped = points.map((point, index) => {
    const x = padding.left + (points.length > 1 ? (index / (points.length - 1)) * innerWidth : innerWidth / 2);
    const ratio = (Number(point.total) || 0) / maxValue;
    const y = padding.top + (innerHeight - ratio * innerHeight);
    return { ...point, x, y, value: Number(point.total) || 0 };
  });

  const linePath = mapped
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaPath = `${linePath} L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;
  const totalAttendance = mapped.reduce((sum, p) => sum + p.value, 0);
  const latest = mapped[mapped.length - 1]?.value || 0;
  const previous = mapped[mapped.length - 2]?.value || 0;
  const delta = latest - previous;
  const deltaText = delta === 0 ? 'No change from last month' : `${delta > 0 ? '+' : ''}${delta} vs last month`;
  const barHeight = 175;

  return (
    <div className="glass-card" style={{ padding: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>Monthly Attendance Trend</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: 3 }}>Last {points.length} months attendance logs</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1 }}>{totalAttendance}</p>
          <p style={{ color: delta >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontSize: '0.72rem', marginTop: 3 }}>{deltaText}</p>
        </div>
      </div>

      {points.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No attendance data available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 320, height: 220 }} role="img" aria-label="Monthly attendance trend chart">
            <defs>
              <linearGradient id="attendanceAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(6,182,212,0.35)" />
                <stop offset="100%" stopColor="rgba(6,182,212,0.02)" />
              </linearGradient>
              <linearGradient id="attendanceLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="attendanceBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = padding.top + tick * innerHeight;
              return (
                <line
                  key={String(tick)}
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="var(--border-glass)"
                  strokeDasharray="4 6"
                  strokeWidth="1"
                />
              );
            })}

            <path d={areaPath} fill="url(#attendanceAreaGradient)" />
            <path d={linePath} fill="none" stroke="url(#attendanceLineGradient)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

            {mapped.map((p) => (
              <g key={p.key}>
                <circle cx={p.x} cy={p.y} r="5" fill="var(--bg-card)" stroke="#06b6d4" strokeWidth="2" />
                <text x={p.x} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{p.label}</text>
                <title>{`${p.label}: ${p.value}`}</title>
              </g>
            ))}
          </svg>
          </div>

          <div>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>Attendance Bar View</p>
            <div style={{ overflowX: 'auto' }}>
            <AttendanceBars points={points.map((point) => ({ ...point, total: Number(point.total) || 0 }))} maxValue={maxValue} width={width} height={barHeight} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
