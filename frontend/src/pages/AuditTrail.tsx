import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import type { AuditEntry, AuditSummary } from '../types';
import { GlowCard } from '../components/GlowCard';
import { ActionBadge } from '../components/PulseBadge';
import { SkeletonTimeline } from '../components/ShimmerSkeleton';

function relativeTime(ts: string | number) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AuditTrail() {
  const [params] = useSearchParams();
  const [agentId, setAgentId] = useState(params.get('agentId') ?? '');
  const [input, setInput]     = useState(agentId);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loaded, setLoaded]   = useState(false);

  const load = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true); setLoaded(false);
    try {
      const res = await api.getAudit(id.trim());
      setEntries([...(res.entries ?? [])].reverse());
      setSummary(res.summary ?? null);
      setLoaded(true);
    } catch { setEntries([]); setLoaded(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (agentId) load(agentId); }, [agentId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAgentId(input.trim());
    load(input.trim());
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Audit Trail</h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Tamper-evident operation history for any agent</p>
      </motion.div>

      {/* Search */}
      <GlowCard delay={0.05} className="p-4 mb-3">
        <form onSubmit={onSubmit} className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="agent_e1d143a0"
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-mono outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', color: 'var(--text-1)', caretColor: 'var(--cyan)' }}
            onFocus={e => (e.target.style.borderColor = 'rgba(0,229,255,0.40)')}
            onBlur={e  => (e.target.style.borderColor = 'rgba(0,229,255,0.15)')}
          />
          <motion.button type="submit" disabled={loading}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.30)', color: 'var(--cyan)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : 'Load'}
          </motion.button>
        </form>
      </GlowCard>

      {/* Summary bar */}
      <AnimatePresence>
        {summary && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Operations',  value: summary.totalOperations ?? 0, color: 'var(--cyan)'   },
              { label: 'Stored',      value: summary.totalStored     ?? 0, color: '#a855f7'       },
              { label: 'Retrieved',   value: summary.totalRetrieved  ?? 0, color: '#60a5fa'       },
              { label: 'Last Active', value: summary.lastActivity ? relativeTime(summary.lastActivity) : '—', color: 'var(--text-1)', isText: true },
            ].map(({ label, value, color, isText }) => (
              <GlowCard key={label} delay={0} className="px-3 py-2 text-center">
                <div className="text-xl font-bold font-mono mb-0.5" style={{ color }}>
                  {isText ? value : value}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</div>
              </GlowCard>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <GlowCard delay={0.12} className="p-4">

        {loading && [0,1,2,3,4].map(i => <SkeletonTimeline key={i} />)}

        {loaded && entries.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-8" style={{ color: 'var(--text-2)' }}>
            <div className="text-3xl mb-3 opacity-30">≋</div>
            <div className="text-sm">No audit entries for <span className="font-mono" style={{ color: 'var(--text-1)' }}>{agentId}</span></div>
          </motion.div>
        )}

        {!loaded && !loading && (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-2)' }}>
            Enter an agent ID to view their audit trail
          </div>
        )}

        <div className="relative">
          {/* Vertical line */}
          {entries.length > 0 && (
            <div className="absolute left-[19px] top-3 bottom-3 w-px"
              style={{ background: 'linear-gradient(180deg, rgba(0,229,255,0.20), rgba(0,229,255,0.05))' }} />
          )}

          {entries.map((entry, i) => {
            const det = entry.details as unknown as Record<string, unknown>;
            const ok = det?.success !== false;
            return (
              <motion.div
                key={`${entry.timestamp}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.055, duration: 0.35, ease: [0.16,1,0.3,1] }}
                className="relative flex gap-5 pb-4 last:pb-0"
              >
                {/* Dot */}
                <div className="relative z-10 flex-shrink-0 mt-0.5">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.055 + 0.1, type: 'spring', stiffness: 500, damping: 22 }}
                    className="w-[10px] h-[10px] rounded-full ring-2"
                    style={{
                      background: ok ? 'var(--green)' : 'var(--red)',
                      boxShadow: `0 0 8px ${ok ? 'rgba(34,197,94,0.50)' : 'rgba(239,68,68,0.50)'}`,
                      border: `2px solid ${ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                      marginTop: 4,
                    }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <ActionBadge action={entry.action} />
                    <span className="text-xs font-mono" style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>
                      {ok ? '✓' : '✗'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{relativeTime(entry.timestamp)}</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {/* Detail pills */}
                  <div className="flex flex-wrap gap-2">
                    {!!det.vaultId && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(168,85,247,0.10)', color: '#a855f7' }}>
                        {String(det.vaultId)}
                      </span>
                    )}
                    {!!det.pieceCid && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(0,229,255,0.08)', color: 'var(--cyan)' }}
                        title={String(det.pieceCid)}>
                        {String(det.pieceCid).slice(0, 18)}…
                      </span>
                    )}
                    {det.size != null && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-2)' }}>
                        {Number(det.size)} B
                      </span>
                    )}
                    {!!det.pdpStatus && (
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(255,255,255,0.04)', color: det.pdpStatus === 'verified' ? 'var(--green)' : 'var(--yellow)' }}>
                        pdp:{String(det.pdpStatus)}
                      </span>
                    )}
                    {!!det.error && (
                      <span className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--red)' }}>
                        {String(det.error).slice(0, 50)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlowCard>
    </div>
  );
}
