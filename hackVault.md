# AgentVault + ClawVault - Implementation Roadmap

> Verifiable Storage Infrastructure for Autonomous AI Agents on Filecoin

**AgentVault** = Backend protocol (storage, payments, identity)
**ClawVault** = OpenClaw plugin (first client, 180K+ developer ecosystem)

**Repository:** https://github.com/xpanvictor/agentvault
**Depends on:** https://github.com/bomanaps/FIL-x402

---

## Project Structure

```
agentvault/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
│
├── src/                            # AgentVault (Backend Protocol)
│   ├── index.ts                    # Entry point
│   │
│   ├── types/
│   │   ├── config.ts
│   │   ├── storage.ts
│   │   ├── agent.ts
│   │   └── index.ts
│   │
│   ├── clients/
│   │   ├── x402.ts                 # FIL-x402 API client
│   │   ├── synapse.ts              # Filecoin Synapse SDK client
│   │   └── index.ts
│   │
│   ├── services/
│   │   ├── storage.ts              # Storage service (Synapse + Mock fallback)
│   │   ├── identity.ts             # ERC-8004 agent identity
│   │   ├── audit.ts                # Audit trail service
│   │   └── index.ts
│   │
│   ├── routes/
│   │   ├── agent.ts                # /agent/* endpoints
│   │   ├── health.ts
│   │   └── index.ts
│   │
│   └── __tests__/
│       ├── storage.test.ts
│       ├── x402-client.test.ts
│       └── agent.test.ts
│
├── clawvault/                      # ClawVault (OpenClaw Plugin)
│   ├── package.json
│   ├── index.ts                    # Plugin entry point
│   ├── tools/
│   │   ├── store.ts                # vault.store() tool
│   │   ├── recall.ts               # vault.recall() tool
│   │   ├── identity.ts             # vault.identity() tool
│   │   └── audit.ts                # vault.audit() tool
│   ├── client.ts                   # AgentVault API client
│   └── __tests__/
│       └── clawvault.test.ts
│
└── scripts/
    ├── demo.ts                     # AgentVault demo
    └── demo-clawvault.ts           # ClawVault demo
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAWVAULT (OpenClaw Plugin)              │
│          "Agents can move money but can't prove who         │
│           they are — ClawVault fixes that"                  │
├─────────────────────────────────────────────────────────────┤
│  @tool vault.store()     → Store agent memory verifiably    │
│  @tool vault.recall()    → Retrieve with PDP proof          │
│  @tool vault.identity()  → Get/verify agent ERC-8004 ID     │
│  @tool vault.audit()     → Show tamper-proof history        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      AGENTVAULT (:3500)                     │
│                    (Backend Protocol)                       │
├─────────────────────────────────────────────────────────────┤
│  POST /agent/store        → Verify payment → Store to       │
│                             Filecoin Onchain Cloud          │
│  GET  /agent/retrieve/:id → Verify payment → Return data    │
│                             with PDP proof                  │
│  POST /agent/register     → Create ERC-8004 agent identity  │
│  GET  /agent/audit/:id    → Get full audit trail            │
│  GET  /agent/verify/:cid  → Verify PDP proof (lightweight)  │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐
│  FIL-x402     │  │ Synapse SDK   │  │ ERC-8004 Registry     │
│  (:3402)      │  │ (Filecoin     │  │ (Base Sepolia)        │
│               │  │ Onchain Cloud)│  │                       │
├───────────────┤  ├───────────────┤  ├───────────────────────┤
│ POST /verify  │  │ upload()      │  │ Agent NFT mint        │
│ POST /settle  │  │ retrieve()    │  │ Agent card → Filecoin │
│ GET  /health  │  │ verifyPDP()   │  │ Pin metadata          │
└───────────────┘  └───────────────┘  └───────────────────────┘
```

---

## Core Modules (from Proposal)

### Module 1: Agent Storage Manager
- REST API wrapping Synapse SDK
- PDP-backed warm storage
- PieceCID indexing

### Module 2: x402 Storage Payments
- **Instant Pay-per-Store:** EIP-3009 transferWithAuthorization
- **Streaming Storage (Escrow):** EIP-712 vouchers with DeferredPaymentEscrow

### Module 3: ERC-8004 Agent Identity Layer
- Agent identity NFT on Base Sepolia
- Agent card metadata pinned to Filecoin
- Storage manifest tracking

### Module 4: Verifiable Agent Memory
- Decision logs with CID linking
- Cross-agent verification
- Reputation scoring

### Module 5: ClawVault (OpenClaw Plugin)
- First client proving any framework can integrate AgentVault
- Targets OpenClaw's 180K+ developer ecosystem
- Solves "agents can move money but can't prove who they are"
- Tools: `vault.store()`, `vault.recall()`, `vault.identity()`, `vault.audit()`

---

## Implementation Stages

### Stage 1: Project Foundation
**Goal:** Basic project setup with working server

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #1 | Initialize project (package.json, tsconfig) | P0 | 🔲 |
| #2 | Create type definitions | P0 | 🔲 |
| #3 | Set up Hono server with health endpoint | P0 | 🔲 |
| #4 | Config loader and .env setup | P0 | 🔲 |

**Deliverable:** Server runs on port 3500, `/health` returns OK

---

### Stage 2: X402 Integration
**Goal:** AgentVault can verify and settle payments via FIL-x402

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #5 | Create X402 API client | P0 | 🔲 |
| #6 | Payment verification flow (EIP-3009) | P0 | 🔲 |
| #7 | Payment settlement flow | P0 | 🔲 |
| #8 | Streaming escrow support (EIP-712 vouchers) | P1 | 🔲 |
| #9 | X402 client tests | P1 | 🔲 |

**Deliverable:** Can call FIL-x402 `/verify` and `/settle` endpoints, support both instant and escrow payments

---

### Stage 3: Storage Service (Synapse SDK)
**Goal:** Store and retrieve data on Filecoin Onchain Cloud with PDP proofs

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #10 | Storage service interface | P0 | 🔲 |
| #11 | Synapse SDK client wrapper | P0 | 🔲 |
| #12 | Mock storage provider (fallback) | P0 | 🔲 |
| #13 | PieceCID ↔ vaultId index | P0 | 🔲 |
| #14 | PDP proof verification | P1 | 🔲 |
| #15 | Storage service tests | P1 | 🔲 |

**Deliverable:** Can store/retrieve data on Filecoin, get back PieceCID with PDP proof

**Risk:** Synapse SDK availability on Calibration testnet - use Mock fallback if needed

---

### Stage 4: Agent Routes
**Goal:** Core API endpoints working end-to-end

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #16 | POST /agent/store endpoint | P0 | 🔲 |
| #17 | GET /agent/retrieve/:pieceCid endpoint | P0 | 🔲 |
| #18 | GET /agent/verify/:pieceCid endpoint | P1 | 🔲 |
| #19 | GET /agent/vaults/:agentId endpoint | P1 | 🔲 |
| #20 | Route integration tests | P1 | 🔲 |

**Deliverable:** Full store → pay → retrieve flow works with PDP verification

---

### Stage 5: ERC-8004 Agent Identity
**Goal:** Agents can register with on-chain identity and Filecoin-pinned metadata

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #21 | Identity service | P1 | 🔲 |
| #22 | POST /agent/register endpoint | P1 | 🔲 |
| #23 | Agent card schema (capabilities, protocols, x402 support) | P1 | 🔲 |
| #24 | Pin agent card to Filecoin | P1 | 🔲 |
| #25 | GET /agent/:agentId endpoint | P1 | 🔲 |
| #26 | Storage manifest tracking | P1 | 🔲 |

**Deliverable:** Agents have ERC-8004 identity NFT with metadata pinned to Filecoin

---

### Stage 6: Audit & Cross-Agent Verification
**Goal:** Full audit trail and cross-agent data verification

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #27 | Audit service | P1 | 🔲 |
| #28 | GET /agent/audit/:agentId endpoint | P1 | 🔲 |
| #29 | Cross-agent verification flow | P1 | 🔲 |
| #30 | Reputation scoring | P2 | 🔲 |

**Deliverable:** Agent B can verify Agent A's data exists on Filecoin via PDP proof

---

### Stage 7: Demo & Documentation
**Goal:** Ready for hackathon submission

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #31 | End-to-end demo script | P0 | 🔲 |
| #32 | README with setup instructions | P0 | 🔲 |
| #33 | Demo video recording | P0 | 🔲 |
| #34 | API documentation | P1 | 🔲 |

**Deliverable:** Hackathon submission ready

---

### Stage 8: ClawVault (OpenClaw Plugin)
**Goal:** Prove AgentVault works as a protocol by building the first client

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| #35 | ClawVault plugin scaffold | P1 | 🔲 |
| #36 | vault.store() tool | P1 | 🔲 |
| #37 | vault.recall() tool | P1 | 🔲 |
| #38 | vault.identity() tool | P1 | 🔲 |
| #39 | vault.audit() tool | P1 | 🔲 |
| #40 | OpenClaw integration tests | P1 | 🔲 |
| #41 | ClawVault demo scenario | P1 | 🔲 |

**Deliverable:** OpenClaw agents can store verifiable memory and prove identity via ClawVault

**Why ClawVault:**
- OpenClaw has 180K+ developers but no verifiable identity/storage
- Agents can move money but can't prove who they are
- ClawVault = cryptographic trust built into OpenClaw
- Proves AgentVault is a protocol, not just a standalone project

---

## Demo Scenario (5 Scenes)

### Scene 1: Agent Registration
- Research Agent registers in ERC-8004 Identity Registry
- Agent card (capabilities, MCP endpoints, x402 support) pinned to Filecoin
- Agent deposits 10 USDFC into escrow contract

### Scene 2: Verifiable Research Storage
- Research Agent generates research summary
- Calls POST /agent/store with data + signed x402 payment
- AgentVault uploads to Filecoin Onchain Cloud via Synapse SDK
- Returns PieceCID, logs operation in audit trail

### Scene 3: Cross-Agent Verification
- Analysis Agent discovers Research Agent via ERC-8004
- Queries storage manifest, retrieves research summary by PieceCID
- Verifies PDP proof - cryptographically proven to be stored on Filecoin

### Scene 4: Audit Trail
- Show full audit trail: who stored what, when, payment ID, PDP status
- All verifiable on-chain

### Scene 5: ClawVault in Action
- OpenClaw agent uses `@tool vault.identity()` to prove who it is
- Agent stores decision log with `@tool vault.store()` - pays autonomously
- Another agent verifies the decision with `@tool vault.recall()`
- Shows: OpenClaw agents now have cryptographic trust built in

---

## Priority Legend

- **P0** - Must have (MVP)
- **P1** - Should have (core features)
- **P2** - Nice to have
- **P3** - Stretch goal

## Status Legend

- 🔲 Not started
- 🟡 In progress
- ✅ Complete
- ❌ Blocked

---

## Timeline (5 Weeks)

| Week | Stage | Focus |
|------|-------|-------|
| Week 1 (Feb 10-16) | Stage 1-2 | Foundation + X402 Integration |
| Week 2 (Feb 17-23) | Stage 3-4 | Storage Service + Routes |
| Week 3 (Feb 24-Mar 2) | Stage 5-6 | ERC-8004 Identity + Audit |
| Week 4 (Mar 3-9) | Stage 7-8 | Demo + ClawVault Plugin |
| Week 5 (Mar 10-16) | Polish | Video, docs, submission |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Synapse SDK testnet instability | Storage operations may fail | Implement retry logic; use Mock fallback |
| PDP proof timing on Calibration | Proofs may be slow for demo | Pre-store demo data; show polling UI |
| ERC-8004 cross-chain complexity | Base Sepolia + Filecoin Calibration | Keep identity on Base, storage on Filecoin, link via CID |
| OpenClaw API changes | ClawVault integration may break | Pin to specific OpenClaw version; abstract tool interface |

---

## Dependencies

- **FIL-x402** must be running on `localhost:3402`
- **Synapse SDK** (`@filecoin/synapse`) - verify availability
- Node.js 20+
- USDFC test tokens (Calibration)
- tFIL for gas (Calibration)
