import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import type { SettlementRecord, SettlementStatus } from '../types';
import { GlowCard } from '../components/GlowCard';
import { SettlementBadge } from '../components/PulseBadge';
import { SkeletonRow } from '../components/ShimmerSkeleton';
import { CountUp } from '../components/CountUp';

type Tab = 'all' | 'pending' | 'failed' | 'settled';

const TABS: { key: Tab; label: string; color: string }[] = [
  { key: 'all',     label: 'All',     color: 'var(--text-1)' },
  { key: 'pending', label: 'Pending', color: 'var(--yellow)'  },
  { key: 'failed',  label: 'Failed',  color: 'var(--red)'     },
  { key: 'settled', label: 'Settled', color: 'var(--green)'   },
];

export function Settlements() {
  const [tab, setTab]           = useState<Tab>('all');
  const [loading, setLoading]   = useState(false);
  const [records, setRecords]   = useState<SettlementRecord[]>([]);
  const [stats, setStats]       = useState({ pending: 0, settled: 0, failed: 0, total: 0 });

  const load = async (status?: SettlementStatus) => {
    setLoading(true);
    try {
      const res = await api.getSettlements(status);
      setRecords(res.records ?? []);
      if (res.stats) setStats(res.stats as typeof stats);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onTab = (t: Tab) => {
    setTab(t);
    load(t === 'all' ? undefined : t);
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Settlements</h1>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>x402 payment settlement tracking</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => load(tab === 'all' ? undefined : tab)}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-2)', cursor: 'pointer' }}>
          ↺ Refresh
        </motion.button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Total',   value: stats.total,   color: 'var(--text-1)', border: 'rgba(255,255,255,0.08)' },
          { label: 'Settled', value: stats.settled, color: 'var(--green)',  border: 'rgba(34,197,94,0.22)'   },
          { label: 'Pending', value: stats.pending, color: 'var(--yellow)', border: 'rgba(234,179,8,0.22)'   },
          { label: 'Failed',  value: stats.failed,  color: 'var(--red)',    border: 'rgba(239,68,68,0.22)'   },
        ].map(({ label, value, color }, i) => (
          <GlowCard key={label} delay={i * 0.07} className="px-4 py-3 text-center">
            <div className="text-2xl font-bold font-mono mb-1" style={{ color }}>
              <CountUp to={value} />
            </div>
            <div className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</div>
            <div className="absolute bottom-0 left-0 right-0 h-px rounded-b-xl"
              style={{ background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />
          </GlowCard>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-3 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(({ key, label, color }) => (
          <motion.button
            key={key}
            onClick={() => onTab(key)}
            whileTap={{ scale: 0.96 }}
            className="relative px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{ cursor: 'pointer', color: tab === key ? color : 'var(--text-2)', background: 'transparent' }}
          >
            {tab === key && (
              <motion.div
                layoutId="tab-pill"
                className="absolute inset-0 rounded-md"
                style={{ background: 'rgba(255,255,255,0.07)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{label}</span>
          </motion.button>
        ))}
      </div>

      {/* Table */}
      <GlowCard delay={0.15} className="overflow-hidden">

        {/* Header */}
        <div className="grid px-4 py-3 text-xs font-medium tracking-widest uppercase"
          style={{ gridTemplateColumns: '120px 120px 1fr 100px 70px 110px 1fr', color: 'var(--text-2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span>Payment ID</span>
          <span>Agent</span>
          <span>Resource</span>
          <span>Status</span>
          <span>Tries</span>
          <span>Date</span>
          <span>Error</span>
        </div>

        {/* Skeletons */}
        {loading && [0,1,2,3].map(i => <SkeletonRow key={i} />)}

        {/* Rows */}
        <AnimatePresence>
          {!loading && records.map((r, i) => {
            const failed = r.status === 'failed';
            return (
              <motion.div
                key={r.paymentId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.28, ease: [0.16,1,0.3,1] }}
                className="grid items-center px-4 py-2.5"
                style={{
                  gridTemplateColumns: '120px 120px 1fr 100px 70px 110px 1fr',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  borderLeft: failed ? '2px solid' : '2px solid transparent',
                  borderLeftColor: failed ? 'rgba(239,68,68,0.4)' : 'transparent',
                }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <span className="text-xs font-mono truncate pr-2" style={{ color: 'var(--text-2)' }}>
                  {r.paymentId?.slice(0, 14) ?? '—'}…
                </span>
                <span className="text-xs font-mono truncate pr-2" style={{ color: '#a855f7' }}>
                  {r.agentId ?? '—'}
                </span>
                <span className="text-xs truncate pr-2" style={{ color: 'var(--text-2)' }}>
                  {r.resource ?? '—'}
                </span>
                <span><SettlementBadge status={r.status} /></span>
                <span className="text-xs font-mono text-center"
                  style={{ color: (r.attempts ?? 1) > 1 ? 'var(--yellow)' : 'var(--text-2)' }}>
                  {r.attempts ?? 1}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {r.lastAttemptAt ? new Date(r.lastAttemptAt).toLocaleDateString() : '—'}
                </span>
                <span className="text-xs truncate" style={{ color: r.error ? 'var(--red)' : 'var(--text-3)' }}>
                  {r.error ? String(r.error).slice(0, 40) : '—'}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty */}
        {!loading && records.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-10" style={{ color: 'var(--text-2)' }}>
            <div className="text-3xl mb-3 opacity-30">⟳</div>
            <div className="text-sm">
              No {tab === 'all' ? '' : tab} settlements
            </div>
          </motion.div>
        )}
      </GlowCard>
    </div>
  );
}
