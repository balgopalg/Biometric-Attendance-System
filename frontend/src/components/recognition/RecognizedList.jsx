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
      padding: isMobile ? 12 : 14, 
      height: isMobile ? 400 : 480, // Enforce fixed height
      display: 'flex', 
      flexDirection: 'column', 
      gap: isMobile ? 8 : 10,
      overflow: 'hidden' // Ensure no overflow outside card
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

      <div className="custom-scrollbar" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 6, 
        overflowY: 'auto', 
        flex: 1,
        minHeight: 0, // Critical for flexbox scrolling
        paddingRight: 6,
        marginRight: -2,
      }}>
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
                  padding: isMobile ? '8px 10px' : '10px 12px',
                  overflow: 'hidden',
                  transition: 'background 0.2s ease',
                  flexShrink: 0 // Prevent cards from being squeezed
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

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      {displayName}
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'monospace' }}>#{subLabel}</span>
                      <span style={{ fontSize: '0.68rem', color: confidence >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)', opacity: 0.8 }}>({confidence}%)</span>
                      {s?.isDrowsy && <span title="Drowsiness Detected">😴</span>}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
                      background: 'rgba(16,185,129,0.12)', color: 'var(--accent-emerald)',
                      border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                      Present
                    </span>
                    <HiOutlineShieldCheck size={14} style={{ color: 'var(--accent-emerald)', opacity: 0.8 }} />
                  </div>
                </div>

                {/* Confidence bar */}
                {confidence > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
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
