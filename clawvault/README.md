# ClawVault

SDK for AI agents to use AgentVault — verifiable Filecoin storage, cryptographic identity, and autonomous x402 payments in 4 tool calls.

> Built as an OpenClaw plugin. Works with any agent framework that accepts tool schemas (LangChain, AutoGen, OpenClaw, custom).

---

## What ClawVault Is

AgentVault is the **infrastructure** — a server that handles Filecoin storage, ERC-8004 identity, and x402 payment verification.

ClawVault is the **SDK** — a thin layer that lets agent code talk to AgentVault without dealing with HTTP endpoints, 402 payment responses, EIP-3009 signature construction, or PDP proof handling.

An agent developer installs ClawVault, points it at an AgentVault server, and gets 4 tools back. That's the entire integration surface.

---

## The Full Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Your Agent Code                      │
│                                                         │
│   vault.store()   vault.recall()                        │
│   vault.identity()   vault.audit()                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │  ClawVault SDK
                           │  • auto-registers agent on first call
                           │  • handles 402 → signs EIP-3009 → retries
                           │  • verifies PDP proofs on recall
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              AgentVault Server  (:3500)                 │
│                                                         │
│   POST /agent/register    POST /agent/store             │
│   GET  /agent/retrieve    GET  /agent/verify            │
│   GET  /agent/audit       GET  /agent/:agentId          │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
   ┌───────────────┐         ┌────────────────────┐
   │   FIL-x402    │         │   Filecoin Network  │
   │   (:3402)     │         │   via Synapse SDK   │
   │               │         │                    │
   │  Verifies     │         │  Uploads data      │
   │  EIP-3009     │         │  Returns PieceCID  │
   │  signatures   │         │  PDP proofs        │
   └───────────────┘         └────────────────────┘
```

---

## Installation

ClawVault lives inside this repository at `clawvault/`. Agent developers import directly from source during development:

```typescript
import { ClawVault } from '../clawvault/src/index.js';
```

When published as a package:

```bash
npm install @agentvault/clawvault
```

```typescript
import { ClawVault } from '@agentvault/clawvault';
```

---

## Initialization

Create one `ClawVault` instance per agent. Pass the server URL, the agent's wallet private key, and an agent card describing the agent.

```typescript
import { ClawVault } from '@agentvault/clawvault';

const vault = new ClawVault({
  url:        'http://localhost:3500',   // AgentVault server URL
  privateKey: '0xYOUR_AGENT_WALLET_KEY', // signs registrations + x402 payments
  agentCard: {
    name:         'ResearchAgent',
    version:      '1.0.0',
    x402Support:  true,
    capabilities: ['research', 'summarisation'],  // optional
  },
});
```

**Configuration options:**

| Option | Required | Description |
|--------|----------|-------------|
| `url` | No | AgentVault server URL. Defaults to `http://localhost:3500` |
| `privateKey` | Yes (for store/identity) | Wallet private key. Used to sign EIP-191 registration messages and EIP-3009 payment authorisations |
| `agentCard` | Yes (for auto-registration) | Metadata stored in the ERC-8004 registry when the agent first registers |
| `agentId` | No | Provide a pre-existing agentId to skip auto-registration |

Registration happens automatically on the first call to any tool. You never need to call a register method manually.

---

## The 4 Tools

### `vault.identity()`

Establishes and proves the agent's cryptographic identity. On first call, registers the agent in the ERC-8004 registry on AgentVault and returns the assigned `agentId`. On subsequent calls, returns the current identity record.

Pass another agent's `agentId` to look them up and verify their registration status.

```typescript
// Get this agent's own identity
const me = await vault.identity();

console.log(me.agentId);           // "agent_e1d143a0"
console.log(me.name);              // "ResearchAgent"
console.log(me.address);           // "0xf39Fd6e51aad..."
console.log(me.verified);          // true
console.log(me.x402Support);       // true
console.log(me.reputation);        // { totalStored: 3, verificationScore: 100 }
console.log(me.storageVaultCount); // 3
```

```typescript
// Verify another agent — before trusting their data
const other = await vault.identity({ agentId: 'agent_e1d143a0' });

if (other.verified) {
  console.log(`${other.name} is a registered ERC-8004 agent`);
  console.log(`Reputation score: ${other.reputation.verificationScore}`);
}
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `agentId` | `string` (optional) | Look up a different agent. Omit to return own identity |

---

### `vault.store()`

Stores data on Filecoin and returns a `pieceCid` — a cryptographic fingerprint of the stored bytes that anyone can verify on-chain. The x402 payment is signed and submitted automatically.

```typescript
const stored = await vault.store({
  data:        JSON.stringify({ finding: 'x402 reduces API latency by 40%' }),
  type:        'decision_log',
  description: 'Market analysis — Q1 2025',
  tags:        ['research', 'latency', 'x402'],
});

console.log(stored.vaultId);  // "vault_137eaa31563d"  — your shorthand reference
console.log(stored.pieceCid); // "bafkzcibcb..."       — lives on Filecoin forever
console.log(stored.size);     // 312  (bytes)
console.log(stored.verified); // true
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | `string` | Yes | The data to store. Serialise objects to JSON before passing |
| `type` | `string` | No | Data type label: `decision_log`, `conversation`, `dataset`, `state`, `other` |
| `description` | `string` | No | Human-readable description stored in the vault metadata |
| `tags` | `string[]` | No | Tags for filtering and organisation |

**What happens under the hood:**

1. ClawVault sends `POST /agent/store` with no payment header
2. AgentVault responds `402 Payment Required` with `{ payTo, maxAmountRequired, tokenAddress }`
3. ClawVault signs an EIP-3009 `TransferWithAuthorization` using the agent's private key
4. ClawVault retries the request with the signed `x-payment` header
5. AgentVault verifies the signature via FIL-x402, uploads to Filecoin via Synapse, returns the PieceCID

Your agent code sees none of this — it just gets the result back.

---

### `vault.recall()`

Retrieves stored data by `vaultId` or `pieceCid`. Includes the PDP verification status — whether Filecoin has cryptographically confirmed the bytes exist.

```typescript
// Recall by vaultId
const recalled = await vault.recall({ id: 'vault_137eaa31563d' });

console.log(recalled.data);        // the original stored string
console.log(recalled.pdpVerified); // true — Filecoin confirmed the bytes
console.log(recalled.pdpStatus);   // "verified" | "pending" | "failed"
console.log(recalled.pieceCid);    // "bafkzcibcb..."

// Recall by PieceCID directly
const recalled2 = await vault.recall({ id: 'bafkzcibcbacommk4p...' });
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Either a `vaultId` (`vault_...`) or a raw `pieceCid` (`bafkz...`) |

**On `pdpVerified`:**

PDP (Proof of Data Possession) is Filecoin's mechanism for storage providers to cryptographically prove they hold your data. On testnet, this typically resolves within 1–2 epochs (~2 minutes). `pdpVerified: true` means the proof is on-chain and independently verifiable by anyone.

---

### `vault.audit()`

Returns the tamper-evident operation log for the agent — every register, store, retrieve, and verify action with timestamps and outcomes.

```typescript
const trail = await vault.audit();

console.log(trail.summary.totalStored);     // 3
console.log(trail.summary.totalRetrieved);  // 1
console.log(trail.summary.totalOperations); // 6

for (const entry of trail.entries) {
  console.log(entry.timestamp); // "2025-03-17T14:12:35.000Z"
  console.log(entry.action);    // "store" | "retrieve" | "register" | "verify"
  console.log(entry.success);   // true | false
  console.log(entry.details);   // { pieceCid, vaultId, size, ... }
}
```

```typescript
// Get audit trail for a different agent
const otherTrail = await vault.audit({ agentId: 'agent_e1d143a0', limit: 20 });
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `agentId` | `string` (optional) | Audit a different agent. Omit for own trail |
| `limit` | `number` (optional) | Max entries to return |

---

## Cross-Agent Verification Flow

A key use case is one agent verifying another agent's stored data before trusting it. The full flow:

```
ResearchAgent                       AnalysisAgent
      │                                   │
      │  vault.store(data)                │
      │  → pieceCid: "bafkz..."           │
      │                                   │
      │  [shares agentId + pieceCid]      │
      │ ─────────────────────────────────►│
      │                                   │
      │                vault.identity({ agentId: researchAgent.agentId })
      │                                   │
      │                → verified: true   │
      │                → name: "ResearchAgent"
      │                → reputation.verificationScore: 100
      │                                   │
      │          [identity confirmed — safe to trust the data]
      │                                   │
      │                vault.recall({ id: pieceCid })
      │                                   │
      │                → data: "..."      │
      │                → pdpVerified: true│
      │                                   │
      │          [data retrieved + Filecoin proof confirmed]
```

```typescript
// ResearchAgent stores
const stored = await researchVault.store({ data: findings, type: 'research' });

// AnalysisAgent receives the agentId and pieceCid out-of-band
// Step 1: verify who stored it
const identity = await analysisVault.identity({ agentId: researchAgent.agentId });
if (!identity.verified) throw new Error('Cannot trust unverified agent');

// Step 2: retrieve with proof
const recalled = await analysisVault.recall({ id: stored.pieceCid });
if (!recalled.pdpVerified) console.warn('PDP pending — check back after next epoch');

const data = JSON.parse(recalled.data);
```

---

## MCP / Framework Integration

ClawVault exposes standard tool definitions that any agent framework can consume.

### Passing tools to a framework

```typescript
const vault = new ClawVault({ url, privateKey, agentCard });

// vault.tools returns the 4 tool definitions as an array
// Pass to any framework that accepts MCP-compatible tool schemas
const agent = new OpenClawAgent({
  tools: vault.tools,
  // vault.tools → [vault_store, vault_recall, vault_identity, vault_audit]
});
```

Each tool definition includes a name, description, and full JSON Schema for the input parameters. The LLM can reason about which tool to call and when.

### Dispatching by name (MCP-style)

```typescript
// The framework calls this when the LLM decides to use a tool
const result = await vault.callTool('vault_store', {
  data:        'Agent decision log entry',
  type:        'decision_log',
  description: 'Autonomous decision made at runtime',
});

// All 4 tool names:
// vault_store
// vault_recall
// vault_identity
// vault_audit
```

### Available tool names and schemas

| Tool name | Method | Description |
|-----------|--------|-------------|
| `vault_store` | `vault.store()` | Store data verifiably on Filecoin |
| `vault_recall` | `vault.recall()` | Retrieve data with PDP proof |
| `vault_identity` | `vault.identity()` | Prove or verify agent identity |
| `vault_audit` | `vault.audit()` | Tamper-evident operation history |

---

## Auto-Registration

Agents do not need to call a register method. On the first call to any tool, ClawVault:

1. Signs a registration message: `AgentVault registration: <address_lowercase>` using the agent's private key (EIP-191)
2. Sends `POST /agent/register` with the address, agent card, and signature
3. AgentVault stores the agent card on Filecoin (returns a `cardCid`) and assigns an `agentId`
4. ClawVault caches the `agentId` for all subsequent calls

If multiple tool calls are made simultaneously before registration completes, ClawVault ensures registration only happens once — concurrent calls wait for the same registration promise.

```typescript
// These two calls fire at the same time — registration happens only once
const [identity, stored] = await Promise.all([
  vault.identity(),
  vault.store({ data: 'first entry', type: 'state' }),
]);
```

---

## x402 Payment Flow (Under the Hood)

Every `vault.store()` and `vault.recall()` call automatically handles the full x402 micropayment cycle. As an agent developer you never see this — but here is what ClawVault does on your behalf:

```
ClawVault                   AgentVault             FIL-x402
    │                           │                     │
    │── POST /agent/store ──────►│                     │
    │   (no payment header)      │                     │
    │◄── 402 {                   │                     │
    │    payTo,                  │                     │
    │    maxAmountRequired,      │                     │
    │    tokenAddress,           │                     │
    │    chainId }               │                     │
    │                            │                     │
    │  [signs EIP-3009           │                     │
    │   TransferWithAuthorization│                     │
    │   using agent private key] │                     │
    │                            │                     │
    │── POST /agent/store ──────►│                     │
    │   x-payment: { signed }    │── POST /verify ────►│
    │                            │◄── { valid: true } ─│
    │                            │                     │
    │                            │  [upload to Filecoin]
    │                            │                     │
    │◄── 201 { vaultId,          │── POST /settle ────►│
    │    pieceCid, pdpStatus }   │   (async, retried)  │
```

In mock mode (`X402_MOCK=true` on the server), the verification and settlement steps are skipped — any `x-payment` header is accepted. This is the default for local development.

---

## Running the Demo

The ClawVault demo (Scene 5) shows two agents — ResearchAgent and AnalysisAgent — using all 4 tools against a live AgentVault server.

**One command (recommended):**

```bash
npm run demo:start clawvault
```

This starts FIL-x402 on `:3402`, starts AgentVault on `:3500`, waits for both to be healthy, then runs the ClawVault demo automatically.

**Manual (two terminals):**

```bash
# Terminal 1 — start AgentVault
npm run dev

# Terminal 2 — run ClawVault demo
npm run demo:clawvault
```

**What the demo shows:**

1. Both agents call `vault.identity()` — registered in ERC-8004, agentIds assigned
2. ResearchAgent calls `vault.store()` — decision log uploaded to Filecoin, PieceCID returned
3. AnalysisAgent calls `vault.identity({ agentId })` — verifies ResearchAgent is who they say they are
4. AnalysisAgent calls `vault.recall()` — retrieves the data, PDP proof confirmed
5. ResearchAgent calls `vault.audit()` — full tamper-evident trail of every operation

**Stop everything:**

```bash
npm run demo:stop
```

---

## Source Layout

```
clawvault/
└── src/
    ├── index.ts       # ClawVault class — 4 tools + MCP callTool interface
    ├── client.ts      # AgentVaultClient — HTTP client with x402 payment handling
    └── tools/
        ├── store.ts   # vault.store() — params, return type, implementation
        ├── recall.ts  # vault.recall() — params, return type, implementation
        ├── identity.ts# vault.identity() — params, return type, implementation
        └── audit.ts   # vault.audit() — params, return type, implementation
```

---

## License

MIT
