import { motion } from 'framer-motion';

export default function StatsCard({ icon: Icon, label, value, color = 'var(--accent-purple)' }) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className="stat-card"
    >
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0,
      }}>
        {Icon && <Icon size={22} />}
      </div>
      <div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
          {label}
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{value}</p>
      </div>
    </motion.div>
  );
}
