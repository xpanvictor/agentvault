import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, BASE } from '../api';
import type { VaultSummary } from '../types';
import { GlowCard } from '../components/GlowCard';
import { PDPBadge } from '../components/PulseBadge';
import { VerifyButton } from '../components/VerifyButton';
import { SkeletonRow } from '../components/ShimmerSkeleton';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function truncateCid(cid: string, n = 10) {
  if (!cid || cid.length <= n * 2 + 3) return cid;
  return `${cid.slice(0, n)}…${cid.slice(-6)}`;
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  decision_log: { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7' },
  conversation:  { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa' },
  dataset:       { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
  state:         { bg: 'rgba(0,229,255,0.10)',   color: '#00e5ff' },
  other:         { bg: 'rgba(148,163,184,0.10)', color: '#94a3b8' },
};

export function Vaults() {
  const [params] = useSearchParams();
  const [agentId, setAgentId] = useState(params.get('agentId') ?? '');
  const [input, setInput]     = useState(agentId);
  const [loading, setLoading] = useState(false);
  const [vaults, setVaults]   = useState<VaultSummary[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [pdpMap, setPdpMap]   = useState<Record<string, string>>({});

  const load = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true); setLoaded(false);
    try {
      const res = await api.getVaults(id.trim());
      setVaults(res.vaults ?? []);
      setLoaded(true);
    } catch { setVaults([]); setLoaded(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (agentId) load(agentId); }, [agentId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAgentId(input.trim());
    load(input.trim());
  };

  const handleVerify = async (pieceCid: string): Promise<boolean> => {
    try {
      const res = await api.verify(pieceCid);
      const status = res.pdpVerified ? 'verified' : 'pending';
      setPdpMap(m => ({ ...m, [pieceCid]: status }));
      return res.pdpVerified;
    } catch { return false; }
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Vault Explorer</h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Browse and verify agent storage on Filecoin</p>
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

      {/* Table */}
      <GlowCard delay={0.10} className="overflow-hidden">

        {/* Table header */}
        <div className="grid px-4 py-3 text-xs font-medium tracking-widest uppercase"
          style={{ gridTemplateColumns: '1fr 100px 1.2fr 80px 80px 120px 100px', color: 'var(--text-2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span>Vault ID</span>
          <span>Type</span>
          <span>Piece CID</span>
          <span>Size</span>
          <span>Date</span>
          <span>PDP Status</span>
          <span>Verify</span>
        </div>

        {/* Loading skeletons */}
        {loading && [0,1,2,3].map(i => <SkeletonRow key={i} />)}

        {/* Rows */}
        <AnimatePresence>
          {!loading && vaults.map((v, i) => {
            const tc = TYPE_COLORS[v.type ?? 'other'] ?? TYPE_COLORS.other;
            const pdpStatus = pdpMap[v.pieceCid] ?? v.pdpStatus ?? 'pending';
            return (
              <motion.div
                key={v.vaultId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16,1,0.3,1] }}
                className="grid items-center px-4 py-2.5"
                style={{
                  gridTemplateColumns: '1fr 100px 1.2fr 80px 80px 120px 100px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  transition: 'background 0.15s',
                }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <span className="text-xs font-mono truncate pr-2" style={{ color: '#a855f7' }}>{v.vaultId}</span>
                <span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: tc.bg, color: tc.color }}>
                    {v.type ?? 'other'}
                  </span>
                </span>
                <a
                  href={`${BASE}/agent/verify/${v.pieceCid}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono truncate pr-2 hover:underline"
                  style={{ color: 'var(--cyan)' }}
                  title={v.pieceCid}
                >
                  {truncateCid(v.pieceCid)}
                </a>
                <span className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>{formatSize(v.size ?? 0)}</span>
                <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {new Date(v.storedAt).toLocaleDateString()}
                </span>
                <span><PDPBadge status={pdpStatus} /></span>
                <span>
                  <VerifyButton
                    pieceCid={v.pieceCid}
                    onVerify={handleVerify}
                    initialState={pdpStatus as 'verified' | 'pending' | 'failed'}
                  />
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty */}
        {loaded && !loading && vaults.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-10" style={{ color: 'var(--text-2)' }}>
            <div className="text-3xl mb-3 opacity-30">▣</div>
            <div className="text-sm">No vaults found for <span className="font-mono" style={{ color: 'var(--text-1)' }}>{agentId}</span></div>
            <div className="text-xs mt-1 opacity-60">Run <span className="font-mono">npm run demo:start</span> to populate vaults</div>
          </motion.div>
        )}

        {!loaded && !loading && (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-2)' }}>
            Enter an agent ID above to load their vaults
          </div>
        )}
      </GlowCard>
    </div>
  );
}
