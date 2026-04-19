import { forwardRef, useState, useEffect } from 'react';

const WebcamFeed = forwardRef(function WebcamFeed({ isActive, error }, ref) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: '#000',
        aspectRatio: isMobile ? '3/4' : '4/3',
        transition: 'aspect-ratio 0.3s ease'
      }}>
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isActive ? 'block' : 'none',
          }}
        />
        {!isActive && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: 8,
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
            </svg>
            <p style={{ fontSize: '0.85rem' }}>Camera not active</p>
          </div>
        )}
        {isActive && (
          <>
            {/* Scanning overlay lines */}
            <div style={{
              position: 'absolute', inset: 0,
              border: '2px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 'var(--radius)',
              pointerEvents: 'none',
            }} />
            {/* Corner accents */}
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => {
              const [v, h] = pos.split('-');
              return (
                <div key={pos} style={{
                  position: 'absolute', [v]: 8, [h]: 8,
                  width: 20, height: 20,
                  borderColor: 'var(--accent-purple)',
                  borderStyle: 'solid', borderWidth: 0,
                  [`border${v === 'top' ? 'Top' : 'Bottom'}Width`]: '3px',
                  [`border${h === 'left' ? 'Left' : 'Right'}Width`]: '3px',
                  borderRadius: pos === 'top-left' ? '8px 0 0 0' : pos === 'top-right' ? '0 8px 0 0' : pos === 'bottom-left' ? '0 0 0 8px' : '0 0 8px 0',
                }} />
              );
            })}
            {/* Live indicator */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(0,0,0,0.6)', borderRadius: 999,
              padding: '4px 10px',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#f43f5e',
                animation: 'pulse-glow 1.5s ease-in-out infinite',
              }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#fff' }}>LIVE</span>
            </div>
          </>
        )}
      </div>
      {error && (
        <p style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', marginTop: 10 }}>{error}</p>
      )}
    </div>
  );
});

export default WebcamFeed;
