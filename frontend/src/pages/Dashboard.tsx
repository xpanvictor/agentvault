import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api';
import type { HealthResponse } from '../types';
import { GlowCard } from '../components/GlowCard';
import { CountUp } from '../components/CountUp';
import { SkeletonCard } from '../components/ShimmerSkeleton';

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="text-xs font-mono font-medium" style={{ color: accent ?? 'var(--text-1)' }}>{value}</span>
    </div>
  );
}

export function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError]   = useState(false);

  const load = async () => {
    try {
      let h = await api.health()
      setHealth(h); setError(false);
      console.log("health data", h)
    }
    catch { setError(true); }
  };

  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, []);

  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center" style={{ minHeight: '65vh' }}>
        <div className="text-5xl mb-4 opacity-30">⬡</div>
        <div className="text-lg font-semibold mb-1" style={{ color: 'var(--text-1)' }}>No signal</div>
        <div className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>AgentVault not responding on :3500</div>
        <button onClick={load} className="px-5 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: 'var(--cyan)', cursor: 'pointer' }}>
          Retry
        </button>
      </motion.div>
    );
  }

  if (!health) {
    return (
      <div>
        <div className="h-7 w-40 shimmer rounded mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0,1,2].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const ok       = health.status === 'ok';
  const storage  = health.storage      as Record<string, unknown>;
  const identity = health.identity     as Record<string, unknown>;
  const audit    = health.audit        as Record<string, unknown>;
  const settle   = (health as unknown as Record<string, unknown>).settlement as Record<string, unknown> ?? {};
  const x402     = health.x402         as Record<string, unknown>;
  const vaults   = Number(storage?.vaults  ?? 0);
  const agents   = Number(identity?.totalAgents ?? 0);
  const settled  = Number(settle?.settled      ?? 0);
  const entries  = Number(audit?.totalEntries    ?? 0);
  const failed   = Number(settle?.failed       ?? 0);
  const total    = Number(settle?.total        ?? 0);
  console.log("rev", storage)

  const stats = [
    { label: 'Total Vaults',      value: vaults,  sub: 'Filecoin PieceCIDs',        color: '#00e5ff' },
    { label: 'Registered Agents', value: agents,  sub: 'ERC-8004 identities',       color: '#a855f7' },
    { label: 'Settlements',       value: settled, sub: 'x402 payments settled',     color: failed > 0 ? '#eab308' : '#22c55e' },
    { label: 'Audit Entries',     value: entries, sub: 'tamper-evident operations', color: '#00e5ff' },
  ];

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Dashboard</h1>
          <div className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>
            v{health.version ?? '0.1.0'} · storage={String(storage?.provider ?? 'mock')}
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full"
          style={{ background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: ok ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 7px ${ok ? 'var(--green)' : 'var(--red)'}`, animation: ok ? 'breathe 2s ease-in-out infinite' : 'none' }} />
          <span className="text-xs font-medium" style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>
            {ok ? 'Operational' : 'Degraded'}
          </span>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map(({ label, value, sub, color }, i) => (
          <GlowCard key={label} delay={i * 0.07} className="p-4 relative overflow-hidden">
            <div className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: 'var(--text-2)' }}>{label}</div>
            <div className="text-3xl font-bold font-mono mb-1" style={{ color }}>
              <CountUp to={value} />
            </div>
            {sub && <div className="text-xs" style={{ color: 'var(--text-3)' }}>{sub}</div>}
            <div className="absolute bottom-0 left-0 right-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
          </GlowCard>
        ))}
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        <GlowCard delay={0.28} className="p-4">
          <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-2)' }}>Storage</div>
          <Row label="Provider" value={String(storage?.provider ?? '—')}
            accent={storage?.provider === 'synapse' ? 'var(--green)' : 'var(--yellow)'} />
          <Row label="Vaults"   value={String(vaults)} />
          <Row label="Agents"   value={String(agents)} />
          <Row label="Backend"  value={storage?.provider === 'synapse' ? 'Filecoin · Synapse SDK' : 'In-memory mock'} />
        </GlowCard>

        <GlowCard delay={0.34} className="p-4">
          <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-2)' }}>x402 Payments</div>
          <Row label="Mode"     value={x402?.mock ? 'Mock (dev)' : 'Live · EIP-3009'}
            accent={x402?.mock ? 'var(--yellow)' : 'var(--green)'} />
          <Row label="Endpoint" value={String(x402?.url ?? 'http://localhost:3402')} />
          <Row label="Status"   value={x402?.mock ? 'Any header accepted' : 'Signature verified'} />
        </GlowCard>

        <GlowCard delay={0.40} className="p-4">
          <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--text-2)' }}>Settlements</div>
          <Row label="Settled"   value={String(settle?.settled ?? 0)} accent="var(--green)"  />
          <Row label="Pending"   value={String(settle?.pending ?? 0)} accent="var(--yellow)" />
          <Row label="Failed"    value={String(failed)} accent={failed > 0 ? 'var(--red)' : 'var(--text-2)'} />
          <Row label="Fail rate" value={total > 0 ? `${((failed / total) * 100).toFixed(1)}%` : '0%'} />
        </GlowCard>

      </div>
    </div>
  );
}
