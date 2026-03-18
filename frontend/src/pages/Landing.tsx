import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { api } from '../api';
import { GlowCard } from '../components/GlowCard';
import { CountUp } from '../components/CountUp';

// ─── Design helpers ────────────────────────────────────────────────────────────

const GRAD: React.CSSProperties = {
  background: 'linear-gradient(135deg, #00e5ff 20%, #a855f7 80%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

function Tag({ label }: { label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <div style={{ width: 20, height: 1, background: 'rgba(0,229,255,0.55)' }} />
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.22em',
        color: 'rgba(0,229,255,0.70)',
      }}>
        {label}
      </span>
      <div style={{ width: 20, height: 1, background: 'rgba(0,229,255,0.55)' }} />
    </div>
  );
}

function ChapterLabel({ n, text }: { n: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.16em',
        color: 'var(--text-3)',
      }}>
        {n}
      </span>
      <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.20em',
        color: 'var(--text-3)',
      }}>
        {text}
      </span>
    </div>
  );
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 26 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.52, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Code block with token coloring ───────────────────────────────────────────

type Token = { text: string; color?: string };

function Code({ lines }: { lines: Token[][] }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.60)',
      border: '1px solid rgba(0,229,255,0.10)',
      borderRadius: 10,
      padding: '18px 22px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      lineHeight: 1.80,
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ minHeight: '1lh' }}>
          {line.map((tok, j) => (
            <span key={j} style={{ color: tok.color ?? 'var(--text-2)' }}>{tok.text}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Copyable terminal block ───────────────────────────────────────────────────

function Terminal({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'rgba(0,0,0,0.72)',
      border: '1px solid rgba(0,229,255,0.18)',
      borderRadius: 10,
      padding: '14px 20px',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
    }}>
      <span style={{ color: 'rgba(0,229,255,0.40)', userSelect: 'none' }}>$</span>
      <span style={{ flex: 1, color: 'var(--text-1)' }}>{cmd}</span>
      <motion.button
        onClick={copy}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          padding: '4px 12px',
          borderRadius: 5,
          border: '1px solid rgba(0,229,255,0.20)',
          background: 'rgba(0,229,255,0.06)',
          color: copied ? 'var(--green)' : 'var(--cyan)',
          cursor: 'pointer',
          transition: 'color 0.18s',
          flexShrink: 0,
        }}
      >
        {copied ? 'COPIED ✓' : 'COPY'}
      </motion.button>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    icon: '◎',
    title: 'No persistent memory',
    body: 'Agent context lives in RAM. The process ends, the agent\'s world ends with it. Every boot is ground zero — learned behaviour, gone.',
    accent: 'var(--red)',
  },
  {
    icon: '◈',
    title: 'No portable identity',
    body: 'Your LangChain agent on Server A and your MCP bot on Server B share no identity. They can\'t verify each other or exchange trust.',
    accent: 'var(--yellow)',
  },
  {
    icon: '≋',
    title: 'No cryptographic proof',
    body: '"We have logs" is not the same as proving what the agent knew and when. Database records are mutable. PDP storage proofs are not.',
    accent: '#f97316',
  },
];

const STEPS = [
  {
    n: '01',
    badge: 'REGISTER',
    title: 'Claim a sovereign identity',
    body: 'One call mints an ERC-8004 identity for your agent — a deterministic agentId bound to an on-chain address. No wallet setup. No gas fees. No accounts to manage.',
    code: [
      [{ text: 'import ', color: '#00e5ff' }, { text: '{ ClawVault }', color: '#f0f6fc' }, { text: ' from ', color: '#00e5ff' }, { text: "'clawvault'", color: '#a855f7' }],
      [{ text: '' }],
      [{ text: 'const ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: ' = new ', color: '#00e5ff' }, { text: 'ClawVault', color: '#22c55e' }, { text: '({ url: VAULT_URL })' }],
      [{ text: '' }],
      [{ text: 'const ', color: '#00e5ff' }, { text: '{ agentId }', color: '#f0f6fc' }, { text: ' = await ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: '.init({' }],
      [{ text: '  name: ', color: '#8b949e' }, { text: "'MyAgent'", color: '#a855f7' }, { text: ', version: ', color: '#8b949e' }, { text: "'1.0.0'", color: '#a855f7' }],
      [{ text: '})' }],
      [{ text: '// → agent_e1d143a0', color: '#3a4550' }],
    ],
  },
  {
    n: '02',
    badge: 'STORE',
    title: 'Seal context to Filecoin',
    body: 'Every reasoning step, decision log, or retrieved dataset gets sealed into a Filecoin deal via the Synapse SDK. Back comes a pieceCid — a content-addressed fingerprint no one can quietly change.',
    code: [
      [{ text: 'const ', color: '#00e5ff' }, { text: '{ vaultId, pieceCid }', color: '#f0f6fc' }, { text: ' = await ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: '.store({' }],
      [{ text: '  type: ', color: '#8b949e' }, { text: "'decision_log'", color: '#a855f7' }, { text: ',' }],
      [{ text: '  data: ', color: '#8b949e' }, { text: 'reasoningContext', color: '#f0f6fc' }, { text: ',' }],
      [{ text: '})' }],
      [{ text: '' }],
      [{ text: '// pieceCid: bafybeig3k...', color: '#3a4550' }],
      [{ text: '// Filecoin deal committed ✓', color: '#22c55e' }],
    ],
  },
  {
    n: '03',
    badge: 'VERIFY',
    title: 'Prove existence, trustlessly',
    body: 'PDP (Proof of Data Possession) lets anyone confirm the data still lives on Filecoin — without downloading it. Every call lands in the tamper-evident audit trail, timestamped and irreversible.',
    code: [
      [{ text: 'const ', color: '#00e5ff' }, { text: '{ pdpVerified }', color: '#f0f6fc' }, { text: ' = await ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: '.verify(pieceCid)' }],
      [{ text: '' }],
      [{ text: '// Filecoin network confirms storage ✓', color: '#22c55e' }],
      [{ text: '// Audit trail updated ✓', color: '#22c55e' }],
      [{ text: '// Timestamp: ', color: '#3a4550' }, { text: 'immutable', color: '#00e5ff' }],
    ],
  },
];

const TOOLS = [
  { name: '.init()',     desc: 'Register identity + auto-create on first call', color: 'var(--cyan)'   },
  { name: '.store()',    desc: 'Seal any JSON blob to Filecoin',                 color: '#a855f7'       },
  { name: '.retrieve()', desc: 'Fetch context by pieceCid from anywhere',       color: '#60a5fa'       },
  { name: '.verify()',   desc: 'Request a PDP proof from the Filecoin network', color: 'var(--green)'  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function Landing() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ vaults: 0, agents: 0, ops: 0 });

  useEffect(() => {
    api.health()
      .then(h => setStats({
        vaults: h.storage.vaults,
        agents: h.storage.agents,
        ops:    h.audit?.totalEntries ?? 0,
      }))
      .catch(() => {});
  }, []);

  return (
    <div style={{ overflowX: 'hidden' }}>

      {/* ══════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════ */}
      <section style={{
        minHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: '40px 24px 60px',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          style={{ maxWidth: 760 }}
        >
          <Tag label="VERIFIABLE AGENT INFRASTRUCTURE" />

          <h1 style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 'clamp(40px, 6.5vw, 76px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.06,
            color: 'var(--text-1)',
            margin: '0 0 24px',
          }}>
            The memory layer<br />
            <span style={GRAD}>for agentic AI.</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text-2)',
              lineHeight: 1.70,
              maxWidth: 520,
              margin: '0 auto 44px',
            }}
          >
            Persistent Filecoin storage, cryptographic agent identity, and
            tamper-evident audit trails — everything your AI needs to remember,
            prove, and be trusted.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.4 }}
            style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 72 }}
          >
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: '0 0 28px rgba(0,229,255,0.35)' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/dashboard')}
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.12em',
                padding: '13px 30px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--cyan)',
                color: '#000',
                cursor: 'pointer',
              }}
            >
              OPEN DASHBOARD
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/agent')}
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.12em',
                padding: '13px 30px',
                borderRadius: 8,
                border: '1px solid rgba(0,229,255,0.22)',
                background: 'rgba(0,229,255,0.05)',
                color: 'var(--cyan)',
                cursor: 'pointer',
              }}
            >
              LOOKUP AN AGENT
            </motion.button>
          </motion.div>

          {/* Live stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.42, duration: 0.5 }}
            style={{ display: 'flex', gap: 48, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            {[
              { label: 'VAULTS ON FILECOIN', value: stats.vaults },
              { label: 'AGENTS REGISTERED',  value: stats.agents },
              { label: 'OPERATIONS AUDITED', value: stats.ops    },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: 32,
                  lineHeight: 1,
                  color: 'var(--cyan)',
                  marginBottom: 6,
                }}>
                  <CountUp to={value} />
                </div>
                <div style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.20em',
                  color: 'var(--text-3)',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,229,255,0.12),transparent)', maxWidth: 700, margin: '0 auto' }} />

      {/* ══════════════════════════════════════════════
          01 — THE PROBLEM
      ══════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '96px 24px 80px' }}>
        <Reveal>
          <ChapterLabel n="01" text="THE PROBLEM" />
          <h2 style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 'clamp(28px, 4vw, 50px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.10,
            color: 'var(--text-1)',
            margin: '0 0 16px',
          }}>
            Agents forget.<br />
            <span style={GRAD}>History disappears.</span>
          </h2>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-2)',
            maxWidth: 480,
            lineHeight: 1.72,
            margin: '0 0 52px',
          }}>
            Every AI agent you ship is amnesiac by design. No verifiable memory,
            no portable identity, no cryptographic proof of what it knew or when.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {PROBLEMS.map(({ icon, title, body, accent }, i) => (
            <Reveal key={title} delay={i * 0.10}>
              <GlowCard delay={0} className="p-6 h-full flex flex-col gap-4">
                <div style={{ fontSize: 20, color: accent }}>{icon}</div>
                <div style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: '-0.01em',
                  color: 'var(--text-1)',
                }}>
                  {title}
                </div>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13.5,
                  color: 'var(--text-2)',
                  lineHeight: 1.68,
                }}>
                  {body}
                </div>
                {/* Accent stripe */}
                <div style={{
                  marginTop: 'auto',
                  height: 2,
                  borderRadius: 2,
                  background: `linear-gradient(90deg, ${accent}, transparent)`,
                  opacity: 0.45,
                }} />
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          02 — HOW IT WORKS
      ══════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 96px' }}>
        <Reveal>
          <ChapterLabel n="02" text="HOW IT WORKS" />
          <h2 style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: 'clamp(28px, 4vw, 50px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.10,
            color: 'var(--text-1)',
            margin: '0 0 16px',
          }}>
            Register. Store.<br />
            <span style={GRAD}>Verify.</span>
          </h2>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-2)',
            maxWidth: 440,
            lineHeight: 1.72,
            margin: '0 0 60px',
          }}>
            Three operations. Zero trust required. Your agent's history
            becomes a cryptographic fact on the Filecoin network.
          </p>
        </Reveal>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {STEPS.map(({ n, badge, title, body, code }, i) => (
            <Reveal key={n} delay={i * 0.06}>
              <GlowCard delay={0} className="p-0 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  {/* Text */}
                  <div style={{ padding: '32px 36px', borderRight: '1px solid rgba(0,229,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: '0.10em',
                        color: 'var(--text-3)',
                      }}>
                        {n}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.20em',
                        padding: '3px 9px',
                        borderRadius: 4,
                        background: 'rgba(0,229,255,0.08)',
                        border: '1px solid rgba(0,229,255,0.18)',
                        color: 'var(--cyan)',
                      }}>
                        {badge}
                      </span>
                    </div>
                    <h3 style={{
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 700,
                      fontSize: 20,
                      letterSpacing: '-0.01em',
                      color: 'var(--text-1)',
                      margin: '0 0 12px',
                    }}>
                      {title}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13.5,
                      color: 'var(--text-2)',
                      lineHeight: 1.70,
                      margin: 0,
                    }}>
                      {body}
                    </p>
                  </div>
                  {/* Code */}
                  <div style={{ padding: '28px 28px', background: 'rgba(0,0,0,0.25)' }}>
                    <Code lines={code} />
                  </div>
                </div>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(168,85,247,0.14),transparent)', maxWidth: 700, margin: '0 auto' }} />

      {/* ══════════════════════════════════════════════
          03 — THE SDK
      ══════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '96px 24px' }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

          {/* Left: copy */}
          <Reveal>
            <ChapterLabel n="03" text="THE SDK" />
            <h2 style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: 'clamp(28px, 4vw, 46px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.10,
              color: 'var(--text-1)',
              margin: '0 0 16px',
            }}>
              One SDK.<br />
              <span style={GRAD}>Four tools.</span>
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text-2)',
              lineHeight: 1.72,
              margin: '0 0 36px',
            }}>
              ClawVault wraps the full AgentVault API into a TypeScript
              package your agent can use in three lines. MCP-native — Claude,
              Gemini, and Cursor can call every tool as a built-in capability.
            </p>

            {/* Tool list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TOOLS.map(({ name, desc, color }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color,
                    minWidth: 112,
                    flexShrink: 0,
                    paddingTop: 1,
                  }}>
                    {name}
                  </span>
                  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.07)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13.5,
                    color: 'var(--text-2)',
                    lineHeight: 1.5,
                  }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right: code */}
          <Reveal delay={0.12}>
            <Terminal cmd="npm install clawvault" />
            <div style={{ marginTop: 14 }}>
              <Code lines={[
                [{ text: 'import ', color: '#00e5ff' }, { text: '{ ClawVault }', color: '#f0f6fc' }, { text: ' from ', color: '#00e5ff' }, { text: "'clawvault'", color: '#a855f7' }],
                [{ text: '' }],
                [{ text: 'const ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: ' = new ', color: '#00e5ff' }, { text: 'ClawVault', color: '#22c55e' }, { text: '({' }],
                [{ text: '  url: ', color: '#8b949e' }, { text: 'process.env.VAULT_URL', color: '#a855f7' }],
                [{ text: '})' }],
                [{ text: '' }],
                [{ text: '// auto-registers on first call', color: '#3a4550' }],
                [{ text: 'await ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: '.init({ name: ', color: '#8b949e' }, { text: "'my-agent'", color: '#a855f7' }, { text: ', version: ', color: '#8b949e' }, { text: "'1.0.0'", color: '#a855f7' }, { text: ' })' }],
                [{ text: '' }],
                [{ text: 'const ', color: '#00e5ff' }, { text: '{ pieceCid }', color: '#f0f6fc' }, { text: ' = await ', color: '#00e5ff' }, { text: 'vault', color: '#f0f6fc' }, { text: '.store({' }],
                [{ text: '  type: ', color: '#8b949e' }, { text: "'decision_log'", color: '#a855f7' }, { text: ', data: ctx' }],
                [{ text: '})' }],
              ]} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          04 — GET STARTED CTA
      ══════════════════════════════════════════════ */}
      <section style={{ padding: '0 24px 120px', display: 'flex', justifyContent: 'center' }}>
        <Reveal className="w-full">
          <div style={{
            maxWidth: 620,
            margin: '0 auto',
            position: 'relative',
            borderRadius: 16,
            border: '1px solid rgba(0,229,255,0.12)',
            background: 'rgba(0,229,255,0.025)',
            padding: '56px 40px',
            textAlign: 'center',
            overflow: 'hidden',
          }}>
            {/* Corner glows */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(168,85,247,0.09)', filter: 'blur(48px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,229,255,0.07)', filter: 'blur(48px)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative' }}>
              <Tag label="GET STARTED" />

              <h2 style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 4vw, 40px)',
                letterSpacing: '-0.02em',
                color: 'var(--text-1)',
                margin: '0 0 12px',
              }}>
                Ready to deploy?
              </h2>
              <p style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--text-2)',
                lineHeight: 1.68,
                margin: '0 0 32px',
              }}>
                Start the server, plug in ClawVault, and your agent has
                permanent verifiable memory in under five minutes.
              </p>

              <div style={{ marginBottom: 24 }}>
                <Terminal cmd="npm install clawvault" />
              </div>

              <motion.button
                whileHover={{ scale: 1.04, boxShadow: '0 0 32px rgba(0,229,255,0.25)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/dashboard')}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.12em',
                  padding: '14px 36px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #00e5ff, #a855f7)',
                  color: '#000',
                  cursor: 'pointer',
                }}
              >
                OPEN DASHBOARD →
              </motion.button>

              <div style={{
                marginTop: 22,
                fontFamily: 'var(--font-ui)',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: 'var(--text-3)',
              }}>
                NO ACCOUNT NEEDED · OPEN SOURCE · MIT LICENSED
              </div>
            </div>
          </div>
        </Reveal>
      </section>

    </div>
  );
}
