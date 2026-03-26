/**
 * AgentVault Demo Script
 *
 * Walks through all 4 demo scenes end-to-end against a running AgentVault server.
 *
 * Prerequisites:
 *   npm run dev   (in another terminal, or X402_MOCK=true npm run dev)
 *
 * Run:
 *   npx tsx scripts/demo.ts
 *   npx tsx scripts/demo.ts --url http://localhost:3500   # custom host
 */

import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1]
  ?? process.env.AGENTVAULT_URL
  ?? 'http://localhost:3500';

// Well-known Anvil / Hardhat test accounts — for EIP-191 registration signatures only
const RESEARCH_AGENT_PK  = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANALYSIS_AGENT_PK  = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// Funded wallet for x402 payments — must have USDFC on Calibration
const PAYER_PK = process.env.STORAGE_PRIVATE_KEY;

// ---------------------------------------------------------------------------
// Terminal colours
// ---------------------------------------------------------------------------

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  red:    '\x1b[31m',
  white:  '\x1b[37m',
};

function banner(text: string) {
  const line = '─'.repeat(60);
  console.log(`\n${c.cyan}${line}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
  console.log(`${c.cyan}${line}${c.reset}\n`);
}

function scene(n: number, title: string) {
  console.log(`\n${c.bold}${c.blue}▶ Scene ${n}: ${title}${c.reset}`);
  console.log(`${c.dim}${'·'.repeat(50)}${c.reset}`);
}

function step(label: string) {
  process.stdout.write(`  ${c.dim}→${c.reset} ${label} ... `);
}

function ok(detail?: string) {
  console.log(`${c.green}✓${c.reset}${detail ? `  ${c.dim}${detail}${c.reset}` : ''}`);
}

function fail(reason: string) {
  console.log(`${c.red}✗  ${reason}${c.reset}`);
}

function field(key: string, value: unknown) {
  const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
  console.log(`     ${c.dim}${key}:${c.reset} ${c.white}${v}${c.reset}`);
}

function info(msg: string) {
  console.log(`  ${c.yellow}ℹ${c.reset}  ${msg}`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function get(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: unknown, headers?: Record<string, string>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

/** Sign a real EIP-3009 TransferWithAuthorization for the given payment requirements */
async function signPayment(
  account: ReturnType<typeof privateKeyToAccount>,
  requirements: { payTo: string; maxAmountRequired: string; tokenAddress: string; chainId: number },
): Promise<string> {
  const nonce       = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const validBefore = Math.floor(Date.now() / 1000) + 300; // 5-min window

  const signature = await account.signTypedData({
    domain: {
      name:              'USD for Filecoin Community',
      version:           '1',
      chainId:           requirements.chainId,
      verifyingContract: requirements.tokenAddress as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from',        type: 'address'  },
        { name: 'to',          type: 'address'  },
        { name: 'value',       type: 'uint256'  },
        { name: 'validAfter',  type: 'uint256'  },
        { name: 'validBefore', type: 'uint256'  },
        { name: 'nonce',       type: 'bytes32'  },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from:        account.address,
      to:          requirements.payTo          as `0x${string}`,
      value:       BigInt(requirements.maxAmountRequired),
      validAfter:  BigInt(0),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });

  return JSON.stringify({
    from:        account.address,
    to:          requirements.payTo,
    value:       requirements.maxAmountRequired,
    validAfter:  0,
    validBefore,
    nonce,
    signature,
    token:       requirements.tokenAddress,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  banner('AgentVault Demo  —  Verifiable AI Agent Storage');
  console.log(`${c.dim}  Server: ${BASE_URL}${c.reset}\n`);

  // ─── Preflight: confirm server is up ─────────────────────────────────────

  step('Connecting to AgentVault');
  try {
    const { body } = await get('/health');
    if (body.status !== 'ok') throw new Error('unhealthy');
    ok(`v${body.version as string}  storage=${(body.storage as Record<string,unknown>).provider as string}  x402.mock=${(body.x402 as Record<string,unknown>).mock}`);
  } catch {
    fail('Server not reachable. Start it with:  X402_MOCK=true npm run dev');
    process.exit(1);
  }

  // Check mock mode and resolve payer account
  const { body: healthBody } = await get('/health');
  const isMock = (healthBody.x402 as Record<string, unknown>).mock === true;

  if (!isMock && !PAYER_PK) {
    console.log(`\n${c.red}  ✗  STORAGE_PRIVATE_KEY is not set but server is in live x402 mode.`);
    console.log(`     Set STORAGE_PRIVATE_KEY in .env or run with X402_MOCK=true.${c.reset}\n`);
    process.exit(1);
  }

  const payerAccount = PAYER_PK ? privateKeyToAccount(PAYER_PK as `0x${string}`) : null;

  if (!isMock) {
    console.log(`\n${c.yellow}  ⚠  Live x402 mode — payments signed by ${payerAccount!.address}${c.reset}\n`);
  }

  // ─── Scene 1: Agent Registration ─────────────────────────────────────────

  scene(1, 'Agent Registration');

  const researchAccount  = privateKeyToAccount(RESEARCH_AGENT_PK as `0x${string}`);
  const analysisAccount  = privateKeyToAccount(ANALYSIS_AGENT_PK as `0x${string}`);

  const researchMsg  = `AgentVault registration: ${researchAccount.address.toLowerCase()}`;
  const analysisMsg  = `AgentVault registration: ${analysisAccount.address.toLowerCase()}`;

  step('Signing EIP-191 registration message for ResearchAgent');
  const researchSig  = await researchAccount.signMessage({ message: researchMsg });
  ok();

  step('Signing EIP-191 registration message for AnalysisAgent');
  const analysisSig  = await analysisAccount.signMessage({ message: analysisMsg });
  ok();

  step('Registering ResearchAgent');
  const { status: rs1, body: reg1 } = await post('/agent/register', {
    address:   researchAccount.address,
    agentCard: { name: 'ResearchAgent', version: '1.0.0', x402Support: true,
                 capabilities: ['research', 'summarisation'] },
    signature: researchSig,
  });
  if (rs1 !== 201 && rs1 !== 200) { fail(`HTTP ${rs1}  ${JSON.stringify(reg1)}`); process.exit(1); }
  const researchAgentId = reg1.agentId as string;
  ok(rs1 === 201 ? 'new registration' : 'already registered');
  field('agentId',  researchAgentId);
  field('address',  reg1.address);
  field('cardCid',  reg1.cardCid);

  step('Registering AnalysisAgent');
  const { status: rs2, body: reg2 } = await post('/agent/register', {
    address:   analysisAccount.address,
    agentCard: { name: 'AnalysisAgent', version: '1.0.0', x402Support: true,
                 capabilities: ['analysis', 'verification'] },
    signature: analysisSig,
  });
  if (rs2 !== 201 && rs2 !== 200) { fail(`HTTP ${rs2}  ${JSON.stringify(reg2)}`); process.exit(1); }
  const analysisAgentId = reg2.agentId as string;
  ok(rs2 === 201 ? 'new registration' : 'already registered');
  field('agentId',  analysisAgentId);

  // ─── Scene 2: Verifiable Research Storage ────────────────────────────────

  scene(2, 'Verifiable Research Storage');

  const researchData = JSON.stringify({
    title:     'Filecoin x402 Micropayment Analysis',
    summary:   'EIP-3009 transferWithAuthorization enables sub-cent per-operation payments, making autonomous agent storage economically viable at scale.',
    findings:  ['Gas cost <$0.001 on Calibration', 'PDP proof available in ~2 epochs', 'Cross-agent CID verification is trustless'],
    timestamp: new Date().toISOString(),
  });

  step('Requesting payment requirements (no payment header)');
  const { status: s402, body: req402 } = await post('/agent/store',
    { agentId: researchAgentId, data: researchData, metadata: { type: 'dataset' } },
  );
  if (s402 !== 402) { fail(`Expected 402, got ${s402}`); process.exit(1); }
  ok('received 402 with payment requirements');
  field('payTo',            req402.payTo);
  field('maxAmountRequired', `${req402.maxAmountRequired} USDFC units`);
  field('tokenAddress',     req402.tokenAddress);

  step('Submitting x402 payment and storing data');
  type Reqs = { payTo: string; maxAmountRequired: string; tokenAddress: string; chainId: number };
  const storeReqs = req402 as Reqs;
  const payment1 = isMock
    ? JSON.stringify({ from: '0x0000000000000000000000000000000000000000', to: storeReqs.payTo, value: storeReqs.maxAmountRequired, validAfter: 0, validBefore: 9999999999, nonce: `0x${'0'.repeat(64)}`, signature: `0x${'0'.repeat(130)}`, token: storeReqs.tokenAddress })
    : await signPayment(payerAccount!, storeReqs);
  const { status: s201, body: stored } = await post('/agent/store',
    { agentId: researchAgentId, data: researchData, metadata: { type: 'dataset', description: 'Filecoin x402 research' } },
    { 'x-payment': payment1 },
  );
  if (s201 !== 201) { fail(`HTTP ${s201}  ${JSON.stringify(stored)}`); process.exit(1); }
  ok('stored on Filecoin');
  field('vaultId',   stored.vaultId);
  field('pieceCid',  stored.pieceCid);
  field('size',      `${stored.size} bytes`);
  field('pdpStatus', stored.pdpStatus);

  const vaultId  = stored.vaultId  as string;
  const pieceCid = stored.pieceCid as string;

  step('Retrieving data with x402 payment');
  const probeGet = await get(`/agent/retrieve/${vaultId}`);
  if (probeGet.status !== 402) { fail(`Expected 402, got ${probeGet.status}`); process.exit(1); }
  const retrieveReqs = probeGet.body as Reqs;
  const payment2 = isMock
    ? JSON.stringify({ from: '0x0000000000000000000000000000000000000000', to: retrieveReqs.payTo, value: retrieveReqs.maxAmountRequired, validAfter: 0, validBefore: 9999999999, nonce: `0x${'0'.repeat(64)}`, signature: `0x${'0'.repeat(130)}`, token: retrieveReqs.tokenAddress })
    : await signPayment(payerAccount!, retrieveReqs);
  const { status: s200, body: retrieved } = await get(
    `/agent/retrieve/${vaultId}`,
    { 'x-payment': payment2 },
  );
  if (s200 !== 200) { fail(`HTTP ${s200}  ${JSON.stringify(retrieved)}`); process.exit(1); }
  ok('retrieved successfully');
  field('pdpStatus',     retrieved.pdpStatus);
  field('data (truncated)', (retrieved.data as string).slice(0, 80) + '…');

  // ─── Scene 3: Cross-Agent Verification ───────────────────────────────────

  scene(3, 'Cross-Agent Verification');

  info(`AnalysisAgent (${analysisAgentId}) discovers ResearchAgent's data and verifies it.`);

  step(`Looking up ResearchAgent's vaults`);
  const { body: vaults } = await get(`/agent/vaults/${researchAgentId}`);
  ok(`found ${(vaults.vaults as unknown[]).length} vault(s)`);

  step(`Verifying PieceCID on Filecoin  (${pieceCid.slice(0, 24)}…)`);
  const { body: verify } = await get(`/agent/verify/${pieceCid}`);
  if (!verify.exists) { fail('pieceCid not found'); process.exit(1); }
  ok(verify.pdpVerified ? 'PDP proof verified ✓' : 'PDP pending (normal on testnet)');
  field('exists',       verify.exists);
  field('storedBy',     verify.storedBy);
  field('pdpVerified',  verify.pdpVerified);
  field('pdpVerifiedAt', verify.pdpVerifiedAt
    ? new Date(verify.pdpVerifiedAt as number).toISOString()
    : 'pending');

  info('Any agent — or anyone — can independently verify this PieceCID on Filecoin.');

  // ─── Scene 4: Audit Trail ─────────────────────────────────────────────────

  scene(4, 'Tamper-Evident Audit Trail');

  step(`Fetching audit trail for ResearchAgent`);
  const { body: audit } = await get(`/agent/audit/${researchAgentId}`);
  const entries = audit.entries as Record<string, unknown>[];
  const summary = audit.summary as Record<string, unknown>;
  ok(`${entries.length} entries`);
  field('totalStored',    summary.totalStored);
  field('totalRetrieved', summary.totalRetrieved);

  console.log(`\n  ${c.dim}Audit entries:${c.reset}`);
  for (const e of entries) {
    const det = e.details as Record<string, unknown>;
    const ts  = new Date(e.timestamp as number).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`    ${c.dim}${ts}${c.reset}  ${c.white}${e.action as string}${c.reset}  ${det.success ? c.green + '✓' : c.red + '✗'}${c.reset}`);
  }

  step('Fetching agent identity record');
  const { body: agentInfo } = await get(`/agent/${researchAgentId}`);
  const agent = agentInfo.agent as Record<string, unknown>;
  ok();
  field('reputation.totalStored',    (agent.reputation as Record<string,unknown>).totalStored);
  field('reputation.verificationScore', (agent.reputation as Record<string,unknown>).verificationScore);
  field('storageManifest entries',   (agent.storageManifest as unknown[]).length);

  // ─── Fin ──────────────────────────────────────────────────────────────────

  const line = '─'.repeat(60);
  console.log(`\n${c.green}${line}${c.reset}`);
  console.log(`${c.bold}${c.green}  Demo complete.${c.reset}`);
  console.log(`${c.green}${line}${c.reset}\n`);

  console.log(`  ${c.bold}What just happened:${c.reset}`);
  console.log(`  ${c.dim}1.${c.reset} Two agents registered with ERC-8004 agent cards`);
  console.log(`  ${c.dim}2.${c.reset} ResearchAgent paid per-operation via x402 (EIP-3009)`);
  console.log(`  ${c.dim}3.${c.reset} Data stored on Filecoin — PieceCID ${c.white}${pieceCid.slice(0,24)}…${c.reset}`);
  console.log(`  ${c.dim}4.${c.reset} AnalysisAgent verified the PieceCID trustlessly`);
  console.log(`  ${c.dim}5.${c.reset} Full audit trail with every operation recorded\n`);
  console.log(`  ${c.dim}Vault:${c.reset}   ${BASE_URL}/agent/retrieve/${vaultId}`);
  console.log(`  ${c.dim}Verify:${c.reset}  ${BASE_URL}/agent/verify/${pieceCid}`);
  console.log(`  ${c.dim}Audit:${c.reset}   ${BASE_URL}/agent/audit/${researchAgentId}\n`);
}

main().catch((err) => {
  console.error(`\n${c.red}Demo failed:${c.reset}`, err);
  process.exit(1);
});
