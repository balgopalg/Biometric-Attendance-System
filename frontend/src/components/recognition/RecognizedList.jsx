import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import {
  HiOutlineSearch,
  HiOutlineShieldCheck,
  HiOutlineUsers,
} from 'react-icons/hi';

function toDisplayText(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value);
      return text && text !== '{}' ? text : fallback;
    } catch { return fallback; }
  }
  return fallback;
}

function formatTime(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return null; }
}

const SORTS = [
  { key: 'latest', label: 'Latest' },
  { key: 'name',   label: 'Name A–Z' },
  { key: 'conf',   label: 'Confidence' },
];

export default function RecognizedList({ students = [], isLive = false }) {
  const safeStudents = Array.isArray(students) ? students : [];
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState('latest');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filtered = useMemo(() => {
    let list = [...safeStudents];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        s => toDisplayText(s?.name, '').toLowerCase().includes(q)
          || toDisplayText(s?.reg_number, '').toLowerCase().includes(q)
      );
    }
    if (sort === 'name') list.sort((a, b) => toDisplayText(a?.name).localeCompare(toDisplayText(b?.name)));
    else if (sort === 'conf') list.sort((a, b) => {
      const ca = Number(a?.confidence) || Number(a?.similarity) || 0;
      const cb = Number(b?.confidence) || Number(b?.similarity) || 0;
      return cb - ca;
    });
    return list;
  }, [safeStudents, search, sort]);

  return (
    <div className="glass-card" style={{ 
      padding: isMobile ? 12 : 20, 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: isMobile ? 10 : 14 
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(16,185,129,0.12)', display: 'grid', placeItems: 'center' }}>
            <HiOutlineUsers size={15} style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>Recognized Students</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {safeStudents.length > 0 && (
            <span style={{
              padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: 'var(--accent-emerald)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              {safeStudents.length} Recognized
            </span>
          )}
          {isLive && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-emerald)', boxShadow: '0 0 6px var(--accent-emerald)', display: 'inline-block' }} />
              Live
            </span>
          )}
        </div>
      </div>

      {/* ── Search + Sort ── */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        alignItems: 'center',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <div style={{ 
          position: 'relative', 
          flex: isSearchFocused ? 1 : 1,
          width: isSearchFocused ? '100%' : 'auto',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <HiOutlineSearch size={14} style={{ 
            position: 'absolute', 
            left: 10, 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: isSearchFocused ? 'var(--accent-emerald)' : 'var(--text-muted)', 
            pointerEvents: 'none',
            transition: 'color 0.2s ease'
          }} />
          <input
            className="input-field"
            placeholder="Search student…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{ 
              paddingLeft: 32, 
              fontSize: '0.8rem', 
              height: 34,
              borderColor: isSearchFocused ? 'var(--accent-emerald)' : 'var(--border-glass)',
              background: isSearchFocused ? 'var(--bg-glass-heavy)' : 'var(--bg-glass)',
              transition: 'all 0.3s ease'
            }}
          />
        </div>
        <select
          className="input-field"
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{ 
            fontSize: '0.75rem', 
            height: 34, 
            padding: '0 12px 0 8px', 
            width: isSearchFocused ? 110 : 140,
            flexShrink: 0,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isSearchFocused ? 0.9 : 1
          }}
        >
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* ── List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 420, paddingRight: 2 }}>
        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 0' }}>
            {safeStudents.length === 0
              ? 'No students recognized yet. Start the camera to begin scanning.'
              : 'No results match your search.'}
          </p>
        )}

        <AnimatePresence initial={false}>
          {filtered.map((s, i) => {
            const displayName = toDisplayText(s?.name, 'Unknown');
            const subLabel    = toDisplayText(s?.reg_number ?? s?.user_id, 'N/A');
            const rawConf     = Number(s?.confidence) || Number(s?.similarity) || 0;
            const confidence  = Math.round(rawConf * 100);
            const timeLabel   = formatTime(s?.recognized_at ?? s?.timestamp);
            const initials    = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

            return (
              <motion.div
                key={toDisplayText(s?.user_id, String(i))}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(16,185,129,0.15)',
                  background: 'rgba(16,185,129,0.04)',
                  padding: isMobile ? '10px 12px' : '12px 14px',
                  overflow: 'hidden',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--gradient-cool)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.8rem', color: '#fff',
                  }}>
                    {initials}
                  </div>

                  {/* Name + reg */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 1 }}>
                      {displayName}
                      <span style={{ marginLeft: 8, fontSize: '0.7rem', color: confidence >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)', opacity: 0.8 }}>({confidence}%)</span>
                      {s?.isDrowsy && <span title="Drowsiness Detected" style={{ marginLeft: 6 }}>😴</span>}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{subLabel}</p>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                      background: 'rgba(16,185,129,0.12)', color: 'var(--accent-emerald)',
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                      ✓ Present
                    </span>
                    <div style={{
                      width: 26, height: 26, borderRadius: 8,
                      background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                      display: 'grid', placeItems: 'center',
                    }}>
                      <HiOutlineShieldCheck size={14} style={{ color: 'var(--accent-emerald)' }} />
                    </div>
                  </div>
                </div>

                {/* Confidence bar */}
                {confidence > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: confidence >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{confidence}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${confidence}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{
                          height: '100%', borderRadius: 99,
                          background: confidence >= 80
                            ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                            : 'linear-gradient(90deg, #f59e0b, #f97316)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                {timeLabel && (
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    🕐 Recognized at {timeLabel}
                  </p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
