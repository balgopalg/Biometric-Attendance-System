import { motion } from 'framer-motion';

function toDisplayText(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value);
      return text && text !== '{}' ? text : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export default function RecognizedList({ students = [] }) {
  const safeStudents = Array.isArray(students) ? students : [];

  return (
    <div className="glass-card" style={{ padding: 20, height: '100%' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
        Recognized Students ({safeStudents.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
        {safeStudents.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>
            No students recognized yet. Start the camera to begin scanning.
          </p>
        )}
        {safeStudents.map((s, i) => {
          const displayName = toDisplayText(s?.name, 'Unknown');
          const subLabel = toDisplayText(s?.reg_number ?? s?.user_id, 'N/A');
          return (
          <motion.div
            key={toDisplayText(s?.user_id, String(i))}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 'var(--radius)',
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.12)',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--gradient-cool)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.75rem', color: '#fff', flexShrink: 0,
            }}>
              {displayName.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                {displayName}
                {s?.isDrowsy && (
                  <span title="Drowsiness Detetced" style={{ marginLeft: 6 }}>😴</span>
                )}
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {subLabel}
              </p>
            </div>
            <span className="badge badge-success">✓ Present</span>
          </motion.div>
          );
        })}
      </div>
    </div>
  );
}
