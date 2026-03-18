import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import type { Agent } from '../types';
import { GlowCard } from '../components/GlowCard';
import { TypewriterText } from '../components/TypewriterText';
import { PDPBadge } from '../components/PulseBadge';
import { SkeletonCard } from '../components/ShimmerSkeleton';

function truncate(s: string, n = 10) {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

export function AgentLookup() {
  const [query, setQuery]   = useState('');
  const [loading, setLoading] = useState(false);
  const [agent, setAgent]   = useState<Agent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setAgent(null); setNotFound(false); setError('');
    try {
      const res = await api.getAgent(query.trim());
      if (res.found && res.agent) { setAgent(res.agent); }
      else { setNotFound(true); }
    } catch { setError('Request failed — is the server running?'); }
    finally { setLoading(false); }
  };

  const score = agent?.reputation?.verificationScore ?? 0;
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Agent Lookup</h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Search the ERC-8004 identity registry</p>
      </motion.div>

      {/* Search */}
      <GlowCard delay={0.05} className="p-4 mb-3">
        <form onSubmit={lookup} className="flex gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="agent_e1d143a0 or 0xAddress..."
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-mono outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(0,229,255,0.15)',
              color: 'var(--text-1)',
              caretColor: 'var(--cyan)',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(0,229,255,0.40)')}
            onBlur={e  => (e.target.style.borderColor = 'rgba(0,229,255,0.15)')}
          />
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.30)', color: 'var(--cyan)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '...' : 'Lookup'}
          </motion.button>
        </form>
      </GlowCard>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-4">
          <SkeletonCard /><SkeletonCard />
        </div>
      )}

      {/* Not found */}
      <AnimatePresence>
        {notFound && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-center py-8" style={{ color: 'var(--text-2)' }}>
            <div className="text-3xl mb-3 opacity-40">◈</div>
            <div className="text-sm">No agent found for <span className="font-mono" style={{ color: 'var(--text-1)' }}>{query}</span></div>
            <div className="text-xs mt-2 opacity-60">Run <span className="font-mono">npm run demo:start</span> to register agents</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="px-4 py-3 rounded-lg text-sm mb-4"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)' }}>
          {error}
        </motion.div>
      )}

      {/* Agent card */}
      <AnimatePresence>
        {agent && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}>

            {/* Identity card */}
            <GlowCard holo delay={0} className="p-4 mb-3">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>{agent.agentCard?.name ?? 'Unknown Agent'}</h2>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>v{agent.agentCard?.version ?? '?'}</div>
                </div>
                {agent.agentCard?.x402Support && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(0,229,255,0.10)', border: '1px solid rgba(0,229,255,0.25)', color: 'var(--cyan)' }}>
                    x402 ✓
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Agent ID', value: agent.agentId, color: '#a855f7' },
                  { label: 'Address',  value: truncate(agent.address, 8), color: 'var(--text-1)' },
                  { label: 'Card CID', value: truncate(agent.cardCid ?? '', 10), color: 'var(--cyan)' },
                  { label: 'Registered', value: new Date(agent.registeredAt).toLocaleDateString(), color: 'var(--text-1)' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-xs mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{label}</div>
                    <span style={{ color }}><TypewriterText text={value} speed={15} className="text-sm" /></span>
                  </div>
                ))}
              </div>

              {/* Capabilities */}
              {(agent.agentCard?.capabilities?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(agent.agentCard?.capabilities ?? []).map((cap: string) => (
                    <span key={cap} className="px-2.5 py-0.5 rounded text-xs font-mono"
                      style={{ background: 'rgba(168,85,247,0.10)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.20)' }}>
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </GlowCard>

            {/* Reputation */}
            <GlowCard delay={0.08} className="p-4 mb-3">
              <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-2)' }}>Reputation</div>
              <div className="grid grid-cols-3 gap-4 mb-3">
                {[
                  { label: 'Stored',    value: agent.reputation?.totalStored    ?? 0, color: '#00e5ff' },
                  { label: 'Retrieved', value: agent.reputation?.totalRetrieved ?? 0, color: '#60a5fa' },
                  { label: 'Score',     value: agent.reputation?.verificationScore ?? 0, color: scoreColor },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-2xl font-bold font-mono mb-1" style={{ color }}>{value}</div>
                    <div className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Score bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.9, delay: 0.3, ease: [0.16,1,0.3,1] }}
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)` }}
                />
              </div>
            </GlowCard>

            {/* Storage manifest preview */}
            {agent.storageManifest?.length > 0 && (
              <GlowCard delay={0.14} className="p-4 mb-3">
                <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-2)' }}>
                  Storage Manifest · {agent.storageManifest.length} vault{agent.storageManifest.length !== 1 ? 's' : ''}
                </div>
                <div className="space-y-2">
                  {agent.storageManifest.slice(0, 3).map((v, i) => (
                    <div key={i} className="flex items-center gap-4 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <span className="text-xs font-mono flex-1 truncate" style={{ color: '#a855f7' }}>{String(v.vaultId ?? '—')}</span>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{String(v.type ?? '—')}</span>
                      <PDPBadge status={String(v.pdpStatus ?? 'pending')} />
                    </div>
                  ))}
                </div>
              </GlowCard>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {[
                { label: 'View Vaults',       path: `/vaults?agentId=${agent.agentId}`,  color: 'var(--cyan)' },
                { label: 'View Audit Trail',  path: `/audit?agentId=${agent.agentId}`,   color: '#a855f7'     },
              ].map(({ label, path, color }) => (
                <motion.button
                  key={label}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(path)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`, color, cursor: 'pointer' }}
                >
                  {label}
                </motion.button>
              ))}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
