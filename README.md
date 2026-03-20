# AgentVault

Verifiable storage infrastructure for autonomous AI agents — Filecoin Onchain Cloud + x402 micropayments + ERC-8004 identity.

> Agents can move money. They can generate outputs. But they can't **prove** who they are or that their data is real.
> AgentVault fixes that.

## What It Does

| Problem | AgentVault Solution |
|---|---|
| Agent outputs are ephemeral | Cryptographically stored on Filecoin with PDP proofs |
| No way to verify "Agent A really stored this" | Every vault has a PieceCID, verifiable on-chain |
| Storage costs block autonomous agents | x402 micropayments — agents pay per operation, no subscription |
| Agents have no persistent identity | ERC-8004 agent cards with Filecoin-backed storage manifest |
| Silent payment failures | Settlement tracker with retry logic and queryable status |

## Architecture

```
AI Agent (Client)
     │
     │  POST /agent/store  (x-payment header)
     │  GET  /agent/retrieve/:id
     ▼
┌─────────────────────────────────────────────┐
│              AgentVault (:3500)             │
│                                             │
│  • Hono REST API          • Rate limiting   │
│  • ERC-8004 Identity      • Audit trail     │
│  • Settlement tracking    • Retry logic     │
└──────────┬──────────────────────┬───────────┘
           │                      │
           ▼                      ▼
   ┌───────────────┐     ┌────────────────────┐
   │   FIL-x402    │     │   Synapse SDK      │
   │   (:3402)     │     │   (Filecoin        │
   │               │     │   Onchain Cloud)   │
   │ EIP-3009 pay  │     │ upload / retrieve  │
   │ on-chain      │     │ PDP proofs         │
   └───────────────┘     └────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- (Optional) [FIL-x402](https://github.com/bomanaps/FIL-x402) running on `:3402` for real payment verification

### 1. Install

```bash
git clone --recurse-submodules https://github.com/xpanvictor/agentvault
cd agentvault
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
- Set `FACILITATOR_ADDRESS` to your wallet address (receives payments)
- Set `X402_MOCK=true` for local dev without FIL-x402
- Set `STORAGE_PROVIDER=synapse` + `STORAGE_PRIVATE_KEY=0x...` for real Filecoin storage

**For Synapse (real Filecoin) mode only** — run once to deposit USDFC into the Synapse payment contract before first use:

```bash
npm run setup:synapse
```

This deposits 5 USDFC on Filecoin Calibration testnet. Skip this entirely if using `STORAGE_PROVIDER=mock`.

### 3. Run

**Mock mode (no external services needed):**
```bash
X402_MOCK=true npm run dev
```

**Full mode (with FIL-x402):**
```bash
# Terminal 1 — FIL-x402 payment infrastructure
cd FIL-x402/facilitator && npm run dev

# Terminal 2 — AgentVault
npm run dev
```

**Docker:**
```bash
docker compose up
```

---

## Dashboard (Frontend UI)

AgentVault ships with a browser dashboard for exploring vaults, agents, audit trails, and settlement status in real time.

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The dashboard connects to the AgentVault API at `:3500`. Start the backend first, then open the frontend. It shows:

- **Dashboard** — live health stats: vaults, agents, settlements, x402 mode
- **Agent Lookup** — search the ERC-8004 identity registry by agent ID or address
- **Vault Explorer** — browse an agent's Filecoin vaults, trigger PDP verification inline
- **Audit Trail** — tamper-evident timeline of every store/retrieve operation
- **Settlements** — x402 payment status with pending/failed/settled filters

→ **For the full workflow — real Filecoin storage, wallet setup, dashboard walkthrough, and ClawVault testing: [hackVault.md](./hackVault.md)**

---

## API Reference

### Storage (x402 payment required)

#### `POST /agent/store`
Store agent data on Filecoin. Returns `402 Payment Required` if no payment header is provided.

```bash
# Step 1 — get payment requirements
curl -X POST http://localhost:3500/agent/store \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_001","data":"my research output"}'
# → 402 { payTo, maxAmountRequired, tokenAddress, chainId }

# Step 2 — pay and store
curl -X POST http://localhost:3500/agent/store \
  -H "Content-Type: application/json" \
  -H "x-payment: <EIP-3009 signed payment>" \
  -d '{"agentId":"agent_001","data":"my research output","metadata":{"type":"decision_log"}}'
# → 201 { vaultId, pieceCid, agentId, storedAt, size, pdpStatus }
```

**Metadata types:** `decision_log` | `conversation` | `dataset` | `state` | `other`

#### `GET /agent/retrieve/:id`
Retrieve stored data by `vaultId` or `pieceCid`. Also requires x402 payment.

```bash
curl http://localhost:3500/agent/retrieve/vault_abc123 \
  -H "x-payment: <signed payment>"
# → 200 { success, data, pieceCid, vaultId, pdpStatus, pdpVerifiedAt }
```

---

### Identity (free)

#### `POST /agent/register`
Register an agent with an ERC-8004 agent card. Verifies EIP-191 signature.

```bash
curl -X POST http://localhost:3500/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYourWalletAddress",
    "agentCard": {
      "name": "ResearchAgent",
      "version": "1.0.0",
      "x402Support": true
    },
    "signature": "0xSignedRegistrationMessage"
  }'
# → 201 { agentId, address, agentCard, cardCid, registeredAt, storageManifest, reputation }
```

The message to sign is: `AgentVault registration: <address_lowercase>`

#### `GET /agent/:agentId`
Get agent info including card, storage manifest, and reputation score.

```bash
curl http://localhost:3500/agent/agent_a1b2c3d4
# → 200 { found, agent: { agentId, address, agentCard, cardCid, storageManifest, reputation } }
```

---

### Verification (free)

#### `GET /agent/verify/:pieceCid`
Verify a PDP proof for a stored piece. No payment required — anyone can verify.

```bash
curl http://localhost:3500/agent/verify/bafk2bzaced...
# → 200 { exists, pieceCid, vaultId, storedBy, pdpVerified, pdpVerifiedAt }
```

#### `GET /agent/vaults/:agentId`
List all vaults for an agent.

```bash
curl http://localhost:3500/agent/vaults/agent_001
# → 200 { agentId, vaults: [{ vaultId, pieceCid, type, size, storedAt, pdpStatus }], total }
```

#### `GET /agent/audit/:agentId`
Full tamper-evident audit trail for an agent.

```bash
curl http://localhost:3500/agent/audit/agent_001
# → 200 { agentId, entries: [...], summary: { totalStored, totalRetrieved, ... } }
```

---

### Operational (free)

#### `GET /agent/settlements`
Query settlement status for x402 payments. Supports `?status=pending|settled|failed`.

```bash
curl http://localhost:3500/agent/settlements?status=failed
# → 200 { stats: { pending, settled, failed, total }, records: [...] }
```

#### `GET /agent/settlements/:paymentId`
Look up a single settlement by payment nonce.

#### `POST /agent/export-registry`
Snapshot the agent registry to Filecoin. Returns a CID — set it as `IDENTITY_REGISTRY_ADDRESS` to restore state on next restart. Requires `IDENTITY_ENABLED=true` and `STORAGE_PROVIDER=synapse`.

#### `GET /health`
Full system health with stats for storage, identity, audit, settlement, and x402.

---

## x402 Payment Flow

```
Agent                    AgentVault              FIL-x402
  │                          │                      │
  │── POST /agent/store ────►│                      │
  │   (no payment)           │                      │
  │◄── 402 { payTo,          │                      │
  │    maxAmountRequired,     │                      │
  │    tokenAddress, chainId }│                      │
  │                          │                      │
  │  [sign EIP-3009 auth]    │                      │
  │                          │                      │
  │── POST /agent/store ────►│                      │
  │   x-payment: { signed }  │── POST /verify ─────►│
  │                          │◄── { valid: true } ──│
  │                          │                      │
  │                          │  [store to Filecoin] │
  │                          │                      │
  │◄── 201 { vaultId,        │── POST /settle ─────►│
  │    pieceCid, pdpStatus } │   (async, with retry)│
```

In mock mode (`X402_MOCK=true`), verification and settlement are skipped — any `x-payment` header is accepted.

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3500` | Server port |
| `X402_API_URL` | `http://localhost:3402` | FIL-x402 endpoint |
| `X402_MOCK` | `false` | Skip payment verification (dev mode) |
| `FACILITATOR_ADDRESS` | `0x000...` | Wallet that receives payments |
| `STORAGE_PROVIDER` | `mock` | `mock` or `synapse` |
| `STORAGE_PRIVATE_KEY` | — | Wallet key for Synapse SDK auth |
| `IDENTITY_ENABLED` | `false` | Enable ERC-8004 identity |
| `IDENTITY_REGISTRY_ADDRESS` | — | CID to restore registry from Filecoin |
| `FILECOIN_NETWORK` | `calibration` | `calibration` or `mainnet` |
| `FILECOIN_CHAIN_ID` | `314159` | 314159 (Calibration) / 314 (Mainnet) |
| `FILECOIN_RPC_URL` | Calibration WSS | WebSocket RPC for Synapse SDK |
| `USDFC_ADDRESS` | Calibration USDFC | USDFC token contract |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

---

## Production Features

- **Retry logic** — Synapse SDK calls and settlement retried with exponential backoff (1s, 2s, 4s)
- **Rate limiting** — 60 req/min per `agentId`, sliding window with automatic cleanup
- **Settlement tracking** — every x402 payment attempt is tracked; query failures via `/agent/settlements`
- **Structured logging** — pino JSON logs with request timing
- **Graceful shutdown** — auto-exports agent registry to Filecoin on SIGTERM/SIGINT
- **Docker** — multi-stage build, non-root user, Alpine healthcheck

---

## ClawVault — SDK for Agent Developers

ClawVault is the SDK that sits on top of AgentVault. It gives any AI agent verifiable memory, cryptographic identity, and autonomous Filecoin storage in 4 tool calls — with zero HTTP boilerplate and zero payment plumbing.

```
Your Agent Code
     │
     │  vault.store() / vault.recall() / vault.identity() / vault.audit()
     ▼
ClawVault SDK  (handles registration, x402 payments, PDP verification)
     │
     │  POST /agent/store  +  x-payment header
     ▼
AgentVault Server  (:3500)
     │
     ▼
Filecoin Network  →  PieceCID
```

**Agent developers point ClawVault at your AgentVault server and get:**

- `vault.identity()` — register and prove who the agent is (ERC-8004)
- `vault.store()` — store data on Filecoin, x402 payment signed automatically
- `vault.recall()` — retrieve data with cryptographic PDP proof
- `vault.audit()` — tamper-evident history of every operation

→ **Full documentation, flow diagrams, and integration guide: [clawvault/README.md](./clawvault/README.md)**

---

## Demo

**Option A — all-in-one (recommended):**

`demo:start` clears ports, starts FIL-x402 (:3402), AgentVault (:3500), and the frontend dashboard (:5173), runs the full demo, then leaves everything running.

```bash
npm run demo:start              # Scenes 1–4 (register, store, retrieve, verify)
npm run demo:start:clawvault    # Scene 5 — ClawVault SDK demo

# When done
npm run demo:stop
```

**Option B — manual (two terminals):**

```bash
# Terminal 1 — start server in mock mode
X402_MOCK=true npm run dev

# Terminal 2 — run demo
npm run demo
```

The demo script:
1. Registers two agents with real EIP-191 signatures (ResearchAgent + AnalysisAgent)
2. Walks the full x402 payment flow: 402 → sign → store → retrieve
3. Has AnalysisAgent verify ResearchAgent's PieceCID trustlessly
4. Prints the tamper-evident audit trail and reputation scores

---

## Development

```bash
npm run dev                  # start with hot reload (tsx watch)
npm run build                # compile TypeScript → dist/
npm start                    # run compiled build (dist/index.js)
npm test                     # run test suite (179 tests, vitest)
npm run lint                 # ESLint check on src/

npm run demo                 # Scenes 1–4 end-to-end demo (requires server running)
npm run demo:clawvault       # Scene 5 ClawVault demo (requires server running)

npm run demo:start           # start FIL-x402 + AgentVault + run demo (all-in-one)
npm run demo:start:clawvault # same, ClawVault demo
npm run demo:stop            # kill ports 3402, 3500 and 5173

npm run setup:synapse        # one-time USDFC deposit for Synapse mode (run before first use)
```

```
src/
├── clients/        # X402Client, Synapse client
├── routes/         # Hono route handlers
├── services/
│   ├── audit.ts         # Audit trail
│   ├── identity/        # ERC-8004 (mock + Synapse-backed)
│   ├── rateLimit.ts     # Sliding window rate limiter
│   ├── settlement.ts    # Settlement tracker
│   └── storage/         # Storage service (mock + Synapse)
├── types/          # Zod schemas, TypeScript types
└── utils/
    ├── logger.ts    # pino logger
    └── retry.ts     # withRetry utility

clawvault/
└── src/
    ├── index.ts     # ClawVault class (4 tools + MCP interface)
    ├── client.ts    # AgentVault HTTP client + 402 payment signing
    └── tools/
        ├── store.ts     # vault.store()
        ├── recall.ts    # vault.recall()
        ├── identity.ts  # vault.identity()
        └── audit.ts     # vault.audit()

frontend/
└── src/
    ├── pages/       # Dashboard, AgentLookup, Vaults, AuditTrail, Settlements, Landing
    ├── components/  # GlowCard, TopNav, NetworkBackground, badges, skeletons
    └── api.ts       # Typed fetch wrappers → :3500
```

---

## License

MIT
