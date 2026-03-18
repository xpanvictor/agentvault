/**
 * ClawVault Demo — Scene 5: ClawVault in Action
 *
 * Shows how an OpenClaw agent uses ClawVault tools to get
 * cryptographic identity and verifiable memory — without any
 * direct HTTP calls or payment plumbing.
 *
 * Prerequisites:
 *   X402_MOCK=true npm run dev   (in another terminal)
 *
 * Run:
 *   npx tsx scripts/demo-clawvault.ts
 *   npx tsx scripts/demo-clawvault.ts --url http://localhost:3500
 */

import { ClawVault } from '../clawvault/src/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1]
  ?? process.env.AGENTVAULT_URL
  ?? 'http://localhost:3500';

// Well-known Anvil / Hardhat test accounts — public keys, never use with real funds
const RESEARCH_PK  = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANALYSIS_PK  = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// ---------------------------------------------------------------------------
// Terminal colours
// ---------------------------------------------------------------------------

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
  white:   '\x1b[37m',
};

function banner(text: string) {
  const line = '─'.repeat(60);
  console.log(`\n${c.magenta}${line}${c.reset}`);
  console.log(`${c.bold}${c.magenta}  ${text}${c.reset}`);
  console.log(`${c.magenta}${line}${c.reset}\n`);
}

function step(agent: string, tool: string, detail?: string) {
  console.log(
    `  ${c.dim}[${agent}]${c.reset} ${c.bold}${c.magenta}@tool ${tool}${c.reset}` +
    (detail ? `  ${c.dim}${detail}${c.reset}` : ''),
  );
}

function result(key: string, value: unknown) {
  const v = typeof value === 'object' ? JSON.stringify(value, null, 0) : String(value);
  console.log(`     ${c.dim}${key}:${c.reset} ${c.white}${v}${c.reset}`);
}

function note(msg: string) {
  console.log(`  ${c.yellow}ℹ${c.reset}  ${msg}`);
}

function ok(msg: string) {
  console.log(`  ${c.green}✓${c.reset}  ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  banner('ClawVault — Scene 5: OpenClaw Agents with Cryptographic Trust');
  console.log(`${c.dim}  Server: ${BASE_URL}${c.reset}`);
  console.log(`${c.dim}  "Agents can move money. Now they can prove who they are."${c.reset}\n`);

  // ─── Check server ──────────────────────────────────────────────────────────

  try {
    const res = await fetch(`${BASE_URL}/health`);
    const h   = await res.json() as Record<string, unknown>;
    if (h.status !== 'ok') throw new Error();
    console.log(`  ${c.green}✓${c.reset} AgentVault running  ${c.dim}(x402.mock=${(h.x402 as Record<string,unknown>).mock})${c.reset}\n`);
  } catch {
    console.error(`  ${c.red}✗ Server not reachable. Run: X402_MOCK=true npm run dev${c.reset}`);
    process.exit(1);
  }

  // ─── Instantiate ClawVault for each agent ──────────────────────────────────

  note('Creating ClawVault instances for ResearchAgent and AnalysisAgent...');

  const researchVault = new ClawVault({
    url:       BASE_URL,
    privateKey: RESEARCH_PK,
    agentCard: {
      name:         'ResearchAgent',
      version:      '1.0.0',
      x402Support:  true,
      capabilities: ['research', 'summarisation'],
    },
  });

  const analysisVault = new ClawVault({
    url:       BASE_URL,
    privateKey: ANALYSIS_PK,
    agentCard: {
      name:         'AnalysisAgent',
      version:      '1.0.0',
      x402Support:  true,
      capabilities: ['analysis', 'verification'],
    },
  });

  console.log(`\n  ${c.bold}Available tools on each vault instance:${c.reset}`);
  for (const tool of researchVault.tools) {
    console.log(`    ${c.magenta}@tool${c.reset} ${tool.name}  ${c.dim}— ${tool.description.slice(0, 60)}…${c.reset}`);
  }

  // ─── Step 1: vault.identity() — prove who you are ─────────────────────────

  console.log(`\n${c.bold}${c.blue}▶ Step 1: Agents prove their identity${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);

  step('ResearchAgent', 'vault.identity()');
  const researchId = await researchVault.identity();
  result('agentId',      researchId.agentId);
  result('name',         researchId.name);
  result('verified',     researchId.verified);
  result('x402Support',  researchId.x402Support);
  ok('ResearchAgent identity established in ERC-8004 registry');

  step('AnalysisAgent', 'vault.identity()');
  const analysisId = await analysisVault.identity();
  result('agentId',  analysisId.agentId);
  result('name',     analysisId.name);
  result('verified', analysisId.verified);
  ok('AnalysisAgent identity established');

  // ─── Step 2: vault.store() — pay and store autonomously ───────────────────

  console.log(`\n${c.bold}${c.blue}▶ Step 2: ResearchAgent stores a decision log${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);

  note('ResearchAgent generates a decision log and calls @tool vault.store()');
  note('x402 payment is handled automatically — agent pays per operation');

  const decisionLog = JSON.stringify({
    decision:   'Recommend deploying AgentVault for all production agents',
    rationale:  'PDP proofs provide cryptographic accountability that centralized storage cannot',
    confidence: 0.94,
    timestamp:  new Date().toISOString(),
  });

  step('ResearchAgent', 'vault.store()', '{ type: "decision_log" }');
  const stored = await researchVault.store({
    data:        decisionLog,
    type:        'decision_log',
    description: 'Deployment decision for AgentVault integration',
    tags:        ['deployment', 'decision', 'filecoin'],
  });

  result('vaultId',   stored.vaultId);
  result('pieceCid',  stored.pieceCid);
  result('size',      `${stored.size} bytes`);
  result('verified',  stored.verified);
  ok(`Decision log stored on Filecoin — PieceCID ${stored.pieceCid.slice(0, 24)}…`);

  // ─── Step 3: cross-agent identity verification ────────────────────────────

  console.log(`\n${c.bold}${c.blue}▶ Step 3: AnalysisAgent verifies ResearchAgent's identity${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);

  note(`AnalysisAgent has the PieceCID: ${stored.pieceCid.slice(0, 24)}…`);
  note('Before trusting the data, it verifies who stored it');

  step('AnalysisAgent', 'vault.identity()', `{ agentId: "${researchId.agentId}" }`);
  const crossVerified = await analysisVault.identity({ agentId: researchId.agentId });

  result('agentId',       crossVerified.agentId);
  result('name',          crossVerified.name);
  result('verified',      crossVerified.verified);
  result('vaultCount',    crossVerified.storageVaultCount);
  result('reputation',    crossVerified.reputation);

  if (crossVerified.verified) {
    ok(`ResearchAgent identity confirmed — ${crossVerified.name} is a registered ERC-8004 agent`);
  } else {
    console.log(`  ${c.red}✗ Could not verify ResearchAgent identity${c.reset}`);
    process.exit(1);
  }

  // ─── Step 4: vault.recall() — retrieve with PDP proof ────────────────────

  console.log(`\n${c.bold}${c.blue}▶ Step 4: AnalysisAgent retrieves and verifies the decision${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);

  step('AnalysisAgent', 'vault.recall()', `{ id: "${stored.pieceCid.slice(0, 16)}…" }`);
  const recalled = await analysisVault.recall({ id: stored.vaultId });

  result('pdpVerified',   recalled.pdpVerified);
  result('pdpStatus',     recalled.pdpStatus);
  result('data (preview)', recalled.data.slice(0, 80) + '…');

  if (recalled.pdpVerified) {
    ok('PDP proof verified — data is cryptographically attested on Filecoin');
  } else {
    note('PDP pending — normal on testnet, will resolve within 1–2 epochs');
  }

  const decision = JSON.parse(recalled.data) as Record<string, unknown>;
  console.log(`\n  ${c.bold}Recovered decision:${c.reset}`);
  result('decision',   decision.decision);
  result('confidence', decision.confidence);

  // ─── Step 5: vault.audit() — show the full trail ──────────────────────────

  console.log(`\n${c.bold}${c.blue}▶ Step 5: Tamper-evident audit trail${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);

  step('ResearchAgent', 'vault.audit()');
  const trail = await researchVault.audit();

  result('totalStored',    trail.summary.totalStored);
  result('totalRetrieved', trail.summary.totalRetrieved);

  console.log(`\n  ${c.dim}Full audit log:${c.reset}`);
  for (const e of trail.entries) {
    const ts  = new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 19);
    const det = e.details as Record<string, unknown>;
    console.log(
      `    ${c.dim}${ts}${c.reset}  ${c.white}${e.action}${c.reset}` +
      `  ${det.success ? c.green + '✓' : c.red + '✗'}${c.reset}`,
    );
  }

  // ─── Fin ──────────────────────────────────────────────────────────────────

  const line = '─'.repeat(60);
  console.log(`\n${c.magenta}${line}${c.reset}`);
  console.log(`${c.bold}${c.magenta}  ClawVault demo complete.${c.reset}`);
  console.log(`${c.magenta}${line}${c.reset}\n`);

  console.log(`  ${c.bold}What ClawVault gave these agents:${c.reset}`);
  console.log(`  ${c.dim}@tool vault.identity()${c.reset}  Cryptographic proof of who they are`);
  console.log(`  ${c.dim}@tool vault.store()${c.reset}     Verifiable memory on Filecoin — autonomous x402 payment`);
  console.log(`  ${c.dim}@tool vault.recall()${c.reset}    Retrieve + PDP proof — any agent can verify`);
  console.log(`  ${c.dim}@tool vault.audit()${c.reset}     Tamper-evident history of every operation`);

  console.log(`\n  ${c.bold}Zero HTTP boilerplate. Zero payment plumbing. Just 4 tools.${c.reset}\n`);
}

main().catch((err) => {
  console.error(`\n${c.red}Demo failed:${c.reset}`, err);
  process.exit(1);
});
