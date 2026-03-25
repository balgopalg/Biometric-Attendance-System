import { motion } from 'framer-motion';

export default function RecognizedList({ students = [] }) {
  return (
    <div className="glass-card" style={{ padding: 20, height: '100%' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
        Recognized Students ({students.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
        {students.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>
            No students recognized yet. Start the camera to begin scanning.
          </p>
        )}
        {students.map((s, i) => (
          <motion.div
            key={s.user_id || i}
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
              {s.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.name}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {s.roll_number || s.user_id}
              </p>
            </div>
            <span className="badge badge-success">✓ Present</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
