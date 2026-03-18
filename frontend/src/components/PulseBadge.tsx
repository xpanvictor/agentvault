import { motion } from 'framer-motion';

type PdpStatus = 'verified' | 'pending' | 'failed' | string;
type SettlementStatus = 'settled' | 'pending' | 'failed' | string;
type ActionType = 'register' | 'store' | 'retrieve' | 'verify' | 'settle' | string;

/* ── PDP Status ─────────────────────────────────────────────── */
export function PDPBadge({ status }: { status: PdpStatus }) {
  if (status === 'verified') {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500 }}
        className="relative inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium overflow-hidden"
        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.30)', color: '#22c55e' }}
      >
        {/* shimmer sweep */}
        <motion.span
          className="absolute inset-0 pointer-events-none"
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.25), transparent)', width: '60%' }}
        />
        <span className="relative z-10 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
          PDP Verified
        </span>
      </motion.span>
    );
  }

  if (status === 'pending') {
    return (
      <span
        className="badge-breathe inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
        style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.28)', color: '#eab308' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
        Pending
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
      Failed
    </span>
  );
}

/* ── Settlement Status ──────────────────────────────────────── */
export function SettlementBadge({ status }: { status: SettlementStatus }) {
  const map: Record<string, { bg: string; border: string; color: string; dot: string; label: string }> = {
    settled: { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.28)',   color: '#22c55e', dot: 'bg-green-400',  label: 'Settled'  },
    pending: { bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.25)',   color: '#eab308', dot: 'bg-yellow-400', label: 'Pending'  },
    failed:  { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',   color: '#ef4444', dot: 'bg-red-400',    label: 'Failed'   },
  };
  const s = map[status] ?? map['pending'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status === 'pending' ? 'badge-breathe' : ''}`}
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} inline-block`} />
      {s.label}
    </span>
  );
}

/* ── Audit Action ───────────────────────────────────────────── */
export function ActionBadge({ action }: { action: ActionType }) {
  const map: Record<string, { bg: string; color: string }> = {
    register: { bg: 'rgba(168,85,247,0.14)',  color: '#a855f7' },
    store:    { bg: 'rgba(0,229,255,0.10)',   color: '#00e5ff' },
    retrieve: { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa' },
    verify:   { bg: 'rgba(34,197,94,0.10)',   color: '#22c55e' },
    settle:   { bg: 'rgba(234,179,8,0.10)',   color: '#eab308' },
  };
  const s = map[action] ?? { bg: 'rgba(148,163,184,0.10)', color: '#94a3b8' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono"
      style={{ background: s.bg, color: s.color }}
    >
      {action}
    </span>
  );
}
