import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const LINKS = [
  { to: '/dashboard',   label: 'DASHBOARD'   },
  { to: '/agent',       label: 'LOOKUP'      },
  { to: '/vaults',      label: 'VAULTS'      },
  { to: '/audit',       label: 'AUDIT'       },
  { to: '/settlements', label: 'SETTLEMENTS' },
];

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const check = () =>
      fetch('http://localhost:3500/health')
        .then(r => setOnline(r.ok))
        .catch(() => setOnline(false));
    check();
    const id = setInterval(check, 12_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center px-6 gap-6"
      style={{
        height: 56,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderBottom: '1px solid rgba(0,229,255,0.10)',
      }}
    >
      {/* Brand ─────────────────────────────── */}
      <div className="flex items-center gap-2.5 flex-shrink-0 mr-2 cursor-pointer" onClick={() => navigate('/')}>
        {/* Hexagon icon */}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 30, height: 30,
            background: 'rgba(0,229,255,0.08)',
            border: '1px solid rgba(0,229,255,0.28)',
            clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="2.2" fill="#00e5ff" opacity="0.85" />
            <circle cx="6.5" cy="6.5" r="4.5" stroke="#00e5ff" strokeWidth="0.8" opacity="0.35" />
          </svg>
        </div>

        <div className="flex flex-col leading-none">
          <span
            className="font-ui font-bold tracking-[0.14em] text-[13px]"
            style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-1)', letterSpacing: '0.14em' }}
          >
            AGENT<span style={{ color: 'var(--cyan)' }}>VAULT</span>
          </span>
          <span
            className="text-[9px] tracking-[0.18em]"
            style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-3)', letterSpacing: '0.18em' }}
          >
            VERIFIABLE STORAGE
          </span>
        </div>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 28, background: 'rgba(0,229,255,0.10)', flexShrink: 0 }} />

      {/* Nav links ──────────────────────────── */}
      <nav className="flex items-center gap-0.5 flex-1">
        {LINKS.map(({ to, label }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              <motion.div
                className="relative px-3.5 py-1.5 cursor-pointer select-none"
                whileHover={{ color: active ? 'var(--cyan)' : '#c0cad6' }}
                style={{
                  color: active ? 'var(--cyan)' : 'var(--text-2)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                }}
              >
                {label}

                {/* Sliding active underline */}
                {active && (
                  <motion.div
                    layoutId="topnav-indicator"
                    className="absolute bottom-0 left-0 right-0 nav-active-line"
                    style={{
                      height: 1,
                      background: 'linear-gradient(90deg, transparent 0%, var(--cyan) 35%, var(--cyan) 65%, transparent 100%)',
                      boxShadow: '0 0 8px rgba(0,229,255,0.60)',
                    }}
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}

                {/* Active top dot */}
                {active && (
                  <motion.div
                    layoutId="topnav-dot"
                    className="absolute top-0 left-1/2 -translate-x-1/2"
                    style={{
                      width: 3, height: 3,
                      borderRadius: '50%',
                      background: 'var(--cyan)',
                      boxShadow: '0 0 6px rgba(0,229,255,0.8)',
                    }}
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      {/* Status ─────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          style={{
            width: 1, height: 22,
            background: 'rgba(255,255,255,0.06)',
            marginRight: 4,
          }}
        />

        <motion.div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: online ? 'var(--green)' : '#3a3a3a' }}
          animate={online ? {
            boxShadow: [
              '0 0 0 0 rgba(34,197,94,0.0)',
              '0 0 0 4px rgba(34,197,94,0.25)',
              '0 0 0 0 rgba(34,197,94,0.0)',
            ],
          } : {}}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        />

        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: online ? 'rgba(34,197,94,0.70)' : 'var(--text-3)',
          }}
        >
          {online ? ':3500' : 'OFFLINE'}
        </span>
      </div>
    </header>
  );
}
