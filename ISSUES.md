# AgentVault + ClawVault - GitHub Issues

> Copy-paste ready issues for GitHub (41 issues total)

---

## Stage 1: Project Foundation

### Issue #1: Initialize project (package.json, tsconfig)

**Labels:** `stage-1`, `setup`, `P0`

**Description**

Set up the base project with proper Node.js/TypeScript configuration.

**Tasks**

- [ ] Create `package.json` with dependencies (hono, zod, pino)
- [ ] Create `tsconfig.json` with ESM + NodeNext settings
- [ ] Create `.gitignore`
- [ ] Create `.env.example`
- [ ] Run `npm install` and verify it works

**Acceptance Criteria**

- `npm run dev` starts without errors

---

### Issue #2: Create type definitions

**Labels:** `stage-1`, `types`, `P0`

**Description**

Define TypeScript types for config, storage, and agent entities.

**Tasks**

- [ ] Create `src/types/config.ts` - Config schema with Zod
- [ ] Create `src/types/storage.ts` - StoreRequest, StoreResponse, VaultEntry
- [ ] Create `src/types/agent.ts` - Agent, AuditEntry, RegisterRequest
- [ ] Create `src/types/index.ts` - Export all types

**Acceptance Criteria**

- Types compile without errors
- Can import types in other files

---

### Issue #3: Set up Hono server with health endpoint

**Labels:** `stage-1`, `server`, `P0`

**Description**

Create the main entry point with a basic Hono server.

**Tasks**

- [ ] Create `src/index.ts` with Hono app
- [ ] Add CORS middleware
- [ ] Add logging middleware
- [ ] Create `GET /health` endpoint
- [ ] Create `GET /` root endpoint with service info
- [ ] Start server on configurable port (default 3500)

**Acceptance Criteria**

- `npm run dev` starts server on port 3500
- `curl localhost:3500/health` returns `{ "status": "ok" }`

---

### Issue #4: Config loader and .env setup

**Labels:** `stage-1`, `config`, `P0`

**Description**

Load configuration from environment variables with validation.

**Tasks**

- [ ] Create `loadConfig()` function in config.ts
- [ ] Add Zod validation for all config fields
- [ ] Support: PORT, X402_API_URL, STORAGE_PROVIDER, SYNAPSE_API_KEY, LOG_LEVEL
- [ ] Exit with error if required config missing

**Acceptance Criteria**

- Server reads config from .env
- Invalid config exits with clear error message

---

## Stage 2: X402 Integration

### Issue #5: Create X402 API client

**Labels:** `stage-2`, `x402`, `P0`

**Description**

HTTP client to communicate with FIL-x402 payment service.

**Tasks**

- [ ] Create `src/clients/x402.ts`
- [ ] Implement `verifyPayment(payment, requirements)` method
- [ ] Implement `settlePayment(payment)` method
- [ ] Implement `healthCheck()` method
- [ ] Add timeout handling (configurable, default 30s)
- [ ] Create `src/clients/index.ts` export

**Acceptance Criteria**

- Can instantiate X402Client with config
- Methods return typed responses
- Handles network errors gracefully

---

### Issue #6: Payment verification flow (EIP-3009)

**Labels:** `stage-2`, `x402`, `P0`

**Description**

Integrate EIP-3009 transferWithAuthorization payment verification.

**Tasks**

- [ ] Create helper to extract payment from request body
- [ ] Create helper to build PaymentRequirements for storage pricing
- [ ] Call X402Client.verifyPayment() before storage operations
- [ ] Return 402 if payment invalid
- [ ] Return 400 if payment missing

**Acceptance Criteria**

- Invalid payment returns 402 with reason
- Valid payment allows request to proceed

---

### Issue #7: Payment settlement flow

**Labels:** `stage-2`, `x402`, `P0`

**Description**

Settle payments on-chain after successful storage.

**Tasks**

- [ ] Call X402Client.settlePayment() after storage success
- [ ] Store paymentId in vault entry
- [ ] Handle settlement failures (log, don't block response)

**Acceptance Criteria**

- Payment settled after storage
- PaymentId returned in response

---

### Issue #8: Streaming escrow support (EIP-712 vouchers)

**Labels:** `stage-2`, `x402`, `escrow`, `P1`

**Description**

Support streaming payments via DeferredPaymentEscrow for frequent storage.

**Tasks**

- [ ] Accept EIP-712 voucher signatures
- [ ] Validate voucher against escrow balance
- [ ] Track cumulative voucher amounts per agent
- [ ] Settle periodically (batch multiple operations)

**Flow**

1. Agent deposits USDFC into DeferredPaymentEscrow
2. Each store: agent signs EIP-712 voucher with cumulative total
3. AgentVault verifies voucher, allows storage
4. Periodic settlement collects accumulated vouchers

**Acceptance Criteria**

- Agent can use escrow deposit for multiple storage operations
- Voucher validation works

---

### Issue #9: X402 client tests

**Labels:** `stage-2`, `x402`, `testing`, `P1`

**Description**

Unit tests for X402 API client.

**Tasks**

- [ ] Create `src/__tests__/x402-client.test.ts`
- [ ] Test verifyPayment with mock responses
- [ ] Test settlePayment with mock responses
- [ ] Test timeout handling
- [ ] Test error handling

**Acceptance Criteria**

- All tests pass
- Coverage > 80%

---

## Stage 3: Storage Service (Synapse SDK)

### Issue #10: Storage service interface

**Labels:** `stage-3`, `storage`, `P0`

**Description**

Define interface for storage providers supporting PDP proofs.

**Tasks**

- [ ] Create `src/services/storage.ts`
- [ ] Define IStorageProvider interface with PDP support
- [ ] Methods: upload(), retrieve(), verifyPDP()
- [ ] Create StorageService class that wraps providers

**Interface**

```typescript
interface IStorageProvider {
  upload(data: string, metadata?: object): Promise<UploadResult>;
  retrieve(pieceCid: string): Promise<RetrieveResult>;
  verifyPDP(pieceCid: string): Promise<PDPVerifyResult>;
}

interface UploadResult {
  success: boolean;
  pieceCid: string;
  size: number;
  pdpStatus: 'pending' | 'verified';
}

interface PDPVerifyResult {
  verified: boolean;
  proof?: object;
  timestamp: number;
}
```

**Acceptance Criteria**

- Interface defined with PDP support
- StorageService accepts provider via config

---

### Issue #11: Synapse SDK client wrapper

**Labels:** `stage-3`, `storage`, `synapse`, `P0`

**Description**

Wrap Filecoin Synapse SDK for Onchain Cloud storage.

**Tasks**

- [ ] Create `src/clients/synapse.ts`
- [ ] Implement upload to Filecoin Onchain Cloud
- [ ] Implement retrieve by PieceCID
- [ ] Implement PDP proof verification
- [ ] Handle Calibration testnet configuration

**Risk Mitigation**

If `@filecoin/synapse` is not available on npm:
- Document findings
- Fall back to Mock provider for demo
- Contact Filecoin team for SDK access

**Acceptance Criteria**

- Can upload data, get PieceCID
- Can retrieve data by PieceCID
- Can verify PDP proof (or graceful fallback)

---

### Issue #12: Mock storage provider (fallback)

**Labels:** `stage-3`, `storage`, `P0`

**Description**

In-memory storage provider for development and as Synapse fallback.

**Tasks**

- [ ] Implement MockStorageProvider class
- [ ] Store data in Map<pieceCid, data>
- [ ] Generate mock PieceCIDs (bafk + hash)
- [ ] Simulate PDP proof responses
- [ ] Implement upload/retrieve/verifyPDP methods

**Acceptance Criteria**

- Can upload data, get PieceCID
- Can retrieve data by PieceCID
- Can simulate PDP verification

---

### Issue #13: PieceCID to vaultId index

**Labels:** `stage-3`, `storage`, `P0`

**Description**

Maintain index for tracking stored data with Filecoin PieceCIDs.

**Tasks**

- [ ] Generate unique vaultId for each store operation
- [ ] Map: vaultId → VaultEntry
- [ ] Map: pieceCid → vaultId
- [ ] Map: agentId → [vaultId]
- [ ] Store PDP status and timestamp

**VaultEntry Fields**

```typescript
interface VaultEntry {
  vaultId: string;
  pieceCid: string;
  agentId: string;
  dataHash: string;
  size: number;
  storedAt: number;
  pdpStatus: 'pending' | 'verified' | 'failed';
  pdpVerifiedAt?: number;
  metadata?: {
    type: string;
    description?: string;
    tags?: string[];
  };
  paymentId?: string;
}
```

**Acceptance Criteria**

- Can lookup by vaultId or PieceCID
- Can list all vaults for an agent
- PDP status tracked

---

### Issue #14: PDP proof verification

**Labels:** `stage-3`, `storage`, `pdp`, `P1`

**Description**

Verify Proof of Data Possession from Filecoin.

**Tasks**

- [ ] Poll for PDP proof after upload
- [ ] Store proof status in vault entry
- [ ] Create verification endpoint helper
- [ ] Handle proof timing (may be async)

**Acceptance Criteria**

- PDP status updates from pending → verified
- Can display proof status in responses

---

### Issue #15: Storage service tests

**Labels:** `stage-3`, `storage`, `testing`, `P1`

**Description**

Unit tests for storage service.

**Tasks**

- [ ] Create `src/__tests__/storage.test.ts`
- [ ] Test mock provider
- [ ] Test PieceCID index operations
- [ ] Test PDP verification flow

**Acceptance Criteria**

- All tests pass
- Coverage > 80%

---

## Stage 4: Agent Routes

### Issue #16: POST /agent/store endpoint

**Labels:** `stage-4`, `routes`, `P0`

**Description**

Endpoint to store data on Filecoin with x402 payment.

**Tasks**

- [ ] Create `src/routes/agent.ts`
- [ ] Parse StoreRequest from body
- [ ] Validate payment via X402 client
- [ ] Store data via StorageService (Synapse or Mock)
- [ ] Settle payment
- [ ] Return StoreResponse with PieceCID

**Request Body**

```json
{
  "agentId": "agent_123",
  "data": "{ ... }",
  "metadata": {
    "type": "decision_log",
    "description": "Trading decision"
  },
  "payment": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "9999999999",
    "nonce": "123",
    "signature": "0x...",
    "token": "0x..."
  }
}
```

**Response**

```json
{
  "success": true,
  "vaultId": "vault_abc123",
  "pieceCid": "baga...",
  "storedAt": 1234567890,
  "size": 256,
  "pdpStatus": "pending",
  "paymentId": "pay_xyz"
}
```

**Acceptance Criteria**

- Store works with valid payment
- Returns 402 with invalid payment
- Returns vaultId and PieceCID

---

### Issue #17: GET /agent/retrieve/:pieceCid endpoint

**Labels:** `stage-4`, `routes`, `P0`

**Description**

Endpoint to retrieve data with payment and PDP proof.

**Tasks**

- [ ] Accept pieceCid or vaultId as :id parameter
- [ ] Validate payment via X402 client
- [ ] Retrieve data via StorageService
- [ ] Include PDP proof status in response

**Response**

```json
{
  "success": true,
  "data": "{ ... }",
  "pieceCid": "baga...",
  "vaultId": "vault_abc123",
  "pdpStatus": "verified",
  "metadata": {
    "type": "decision_log",
    "storedAt": 1234567890,
    "storedBy": "agent_123"
  }
}
```

**Acceptance Criteria**

- Can retrieve by vaultId or PieceCID
- Returns PDP status
- Returns 402 with invalid payment

---

### Issue #18: GET /agent/verify/:pieceCid endpoint

**Labels:** `stage-4`, `routes`, `P1`

**Description**

Lightweight PDP verification without data retrieval (no payment required).

**Tasks**

- [ ] Look up PieceCID in vault index
- [ ] Check PDP proof status
- [ ] Return verification result

**Response**

```json
{
  "exists": true,
  "pieceCid": "baga...",
  "vaultId": "vault_abc123",
  "storedBy": "agent_123",
  "storedAt": 1234567890,
  "pdpVerified": true,
  "pdpVerifiedAt": 1234567900
}
```

**Acceptance Criteria**

- Returns PDP verification status
- No payment required
- Fast response (no data fetch)

---

### Issue #19: GET /agent/vaults/:agentId endpoint

**Labels:** `stage-4`, `routes`, `P1`

**Description**

List all vaults owned by an agent (storage manifest).

**Tasks**

- [ ] Look up agentId in index
- [ ] Return list of vault entries with PDP status
- [ ] Support pagination (limit, offset query params)

**Response**

```json
{
  "agentId": "agent_123",
  "vaults": [
    {
      "vaultId": "vault_abc",
      "pieceCid": "baga...",
      "type": "decision_log",
      "storedAt": 1234567890,
      "size": 256,
      "pdpStatus": "verified"
    }
  ],
  "total": 5
}
```

**Acceptance Criteria**

- Returns all vaults for agent
- Includes PDP status per vault

---

### Issue #20: Route integration tests

**Labels:** `stage-4`, `routes`, `testing`, `P1`

**Description**

Integration tests for agent routes.

**Tasks**

- [ ] Create `src/__tests__/agent.test.ts`
- [ ] Test store → retrieve flow
- [ ] Test PDP verification
- [ ] Test with mock X402 responses
- [ ] Test error cases (402, 404)

**Acceptance Criteria**

- Full flow tested
- Error cases covered

---

## Stage 5: ERC-8004 Agent Identity

### Issue #21: Identity service

**Labels:** `stage-5`, `identity`, `erc8004`, `P1`

**Description**

Service to manage ERC-8004 agent registrations.

**Tasks**

- [ ] Create `src/services/identity.ts`
- [ ] Store agent records
- [ ] Generate agentId on registration
- [ ] Track storage manifest per agent
- [ ] Address to agentId lookup

**Acceptance Criteria**

- Can register agent
- Can lookup agent by ID or address

---

### Issue #22: POST /agent/register endpoint

**Labels:** `stage-5`, `identity`, `P1`

**Description**

Register a new agent with ERC-8004 agent card.

**Tasks**

- [ ] Parse RegisterAgentRequest
- [ ] Validate signature (proves address ownership)
- [ ] Create agent record with agent card
- [ ] Return agent info

**Request**

```json
{
  "address": "0x1234...abcd",
  "agentCard": {
    "name": "Research Agent",
    "description": "Analyzes market data",
    "version": "1.0.0",
    "capabilities": ["search", "summarize", "analyze"],
    "protocols": ["mcp", "a2a", "x402"],
    "x402Support": true,
    "endpoints": {
      "api": "https://agent.example.com/api",
      "webhook": "https://agent.example.com/webhook"
    }
  },
  "signature": "0x..."
}
```

**Acceptance Criteria**

- Agent registered with agent card
- Returns agentId

---

### Issue #23: Agent card schema (capabilities, protocols, x402 support)

**Labels:** `stage-5`, `identity`, `P1`

**Description**

Define ERC-8004 compliant agent card schema.

**Tasks**

- [ ] Define AgentCard TypeScript interface
- [ ] Add Zod validation schema
- [ ] Support: name, description, version, capabilities, protocols, endpoints, x402Support

**Schema**

```typescript
interface AgentCard {
  name: string;
  description?: string;
  version: string;
  capabilities?: string[];
  protocols?: ('mcp' | 'a2a' | 'x402' | 'other')[];
  endpoints?: {
    api?: string;
    webhook?: string;
  };
  x402Support: boolean;
}
```

**Acceptance Criteria**

- Schema validates correctly
- All fields documented

---

### Issue #24: Pin agent card to Filecoin

**Labels:** `stage-5`, `identity`, `P1`

**Description**

Store agent card metadata on Filecoin via storage service.

**Tasks**

- [ ] On registration, upload agent card to Filecoin
- [ ] Store cardCid in agent record
- [ ] Link to ERC-8004 identity

**Acceptance Criteria**

- Agent card stored on Filecoin
- cardCid available in agent info

---

### Issue #25: GET /agent/:agentId endpoint

**Labels:** `stage-5`, `identity`, `P1`

**Description**

Get agent information including agent card and storage manifest.

**Tasks**

- [ ] Look up agent by ID
- [ ] Return agent card + cardCid
- [ ] Include storage manifest summary
- [ ] Include reputation stats

**Response**

```json
{
  "found": true,
  "agent": {
    "agentId": "agent_abc123",
    "address": "0x1234...abcd",
    "agentCard": {
      "name": "Research Agent",
      "capabilities": ["search", "summarize"],
      "x402Support": true
    },
    "cardCid": "baga...",
    "registeredAt": 1234567890,
    "storageManifest": [
      { "vaultId": "...", "pieceCid": "...", "type": "..." }
    ],
    "reputation": {
      "totalStored": 10,
      "totalRetrieved": 5,
      "verificationScore": 98
    }
  }
}
```

**Acceptance Criteria**

- Returns agent info with card
- Returns 404 if not found

---

### Issue #26: Storage manifest tracking

**Labels:** `stage-5`, `identity`, `P1`

**Description**

Track what each agent has stored (per ERC-8004 spec).

**Tasks**

- [ ] Add to manifest on store operation
- [ ] Include in agent info response
- [ ] Track: vaultId, pieceCid, type, storedAt, size, pdpStatus

**Acceptance Criteria**

- Manifest updates on store
- Manifest visible in GET /agent/:id

---

## Stage 6: Audit & Cross-Agent Verification

### Issue #27: Audit service

**Labels:** `stage-6`, `audit`, `P1`

**Description**

Track all operations for transparency and verifiability.

**Tasks**

- [ ] Create `src/services/audit.ts`
- [ ] Log store operations with PDP status
- [ ] Log retrieve operations
- [ ] Log verify operations
- [ ] Log register operations
- [ ] Store: id, timestamp, agentId, action, details, success

**Acceptance Criteria**

- All operations logged
- Can query by agentId

---

### Issue #28: GET /agent/audit/:agentId endpoint

**Labels:** `stage-6`, `audit`, `P1`

**Description**

Get audit trail for an agent.

**Tasks**

- [ ] Query audit service by agentId
- [ ] Return sorted by timestamp (newest first)
- [ ] Include PDP verification events
- [ ] Include summary stats

**Response**

```json
{
  "agentId": "agent_123",
  "entries": [
    {
      "id": "audit_xyz",
      "timestamp": 1234567890,
      "action": "store",
      "details": {
        "vaultId": "vault_abc",
        "pieceCid": "baga...",
        "size": 256,
        "pdpStatus": "verified",
        "paymentId": "pay_xyz",
        "success": true
      }
    }
  ],
  "summary": {
    "totalOperations": 42,
    "totalStored": 30,
    "totalRetrieved": 12,
    "lastActivity": 1234567890
  }
}
```

**Acceptance Criteria**

- Returns full audit trail with PDP events
- Summary stats accurate

---

### Issue #29: Cross-agent verification flow

**Labels:** `stage-6`, `verification`, `P1`

**Description**

Allow agents to verify other agents' data via PDP.

**Tasks**

- [ ] Create cross-agent verification endpoint
- [ ] Check PieceCID exists
- [ ] Verify PDP proof
- [ ] Return owner agent info

**Use Case**

Agent B wants to verify that data claimed by Agent A actually exists on Filecoin before trusting it.

**Response**

```json
{
  "pieceCid": "baga...",
  "verified": true,
  "pdpProof": { ... },
  "owner": {
    "agentId": "agent_123",
    "address": "0x...",
    "name": "Research Agent"
  },
  "storedAt": 1234567890
}
```

**Acceptance Criteria**

- Agent B can verify Agent A's data ownership
- PDP proof included in verification

---

### Issue #30: Reputation scoring

**Labels:** `stage-6`, `reputation`, `P2`

**Description**

Track agent reliability scores based on PDP verification.

**Tasks**

- [ ] Initialize score at 100 on registration
- [ ] Increase on successful PDP verifications
- [ ] Decrease on failed verifications
- [ ] Include in agent info response

**Scoring Rules**

- Successful store with PDP verified: +1
- Data verified by other agents: +2
- PDP verification failed: -20

**Acceptance Criteria**

- Reputation score calculated and updated
- Visible in GET /agent/:id response

---

## Stage 7: Demo & Documentation

### Issue #31: End-to-end demo script (4 scenes)

**Labels:** `stage-7`, `demo`, `P0`

**Description**

Script demonstrating full AgentVault flow matching proposal demo.

**Demo Scenes**

**Scene 1: Agent Registration**
- Research Agent registers in ERC-8004 Identity Registry
- Agent card pinned to Filecoin
- Agent deposits USDFC into escrow

**Scene 2: Verifiable Research Storage**
- Research Agent stores research summary
- x402 payment validated
- Data uploaded to Filecoin Onchain Cloud
- PieceCID returned with PDP status

**Scene 3: Cross-Agent Verification**
- Analysis Agent discovers Research Agent
- Retrieves research summary by PieceCID
- Verifies PDP proof

**Scene 4: Audit Trail**
- Show full audit trail
- Display PDP verification status

**Tasks**

- [ ] Create `scripts/demo.ts`
- [ ] Implement all 4 scenes
- [ ] Print clear console output with timestamps
- [ ] Handle errors gracefully

**Usage**

```bash
npm run demo
```

**Acceptance Criteria**

- Script runs all 4 scenes
- Clear visual output
- Shows PDP verification

---

### Issue #32: README with setup instructions

**Labels:** `stage-7`, `docs`, `P0`

**Description**

Documentation for running the project.

**Sections**

- [ ] Project overview (what is AgentVault)
- [ ] Architecture diagram
- [ ] Prerequisites (Node.js, FIL-x402, Synapse SDK)
- [ ] Installation steps
- [ ] Configuration (.env with Synapse API key)
- [ ] Running the server
- [ ] Running FIL-x402 dependency
- [ ] API examples (curl)
- [ ] Running demo

**Acceptance Criteria**

- New developer can set up project in 10 minutes

---

### Issue #33: Demo video recording

**Labels:** `stage-7`, `demo`, `P0`

**Description**

3-minute video for hackathon submission.

**Script Outline**

1. (0:00-0:30) Problem statement - agents need verifiable storage
2. (0:30-1:00) Architecture overview - AgentVault + FIL-x402 + Synapse SDK
3. (1:00-2:00) Live demo - register, store, retrieve with PDP
4. (2:00-2:30) Cross-agent verification
5. (2:30-3:00) Conclusion - audit trail, future plans

**Tasks**

- [ ] Write demo script
- [ ] Set up clean demo environment
- [ ] Record screen + voice
- [ ] Upload to YouTube (unlisted)

**Acceptance Criteria**

- Video under 3 minutes
- Shows PDP verification flow
- Audio is clear

---

### Issue #34: API documentation

**Labels:** `stage-7`, `docs`, `P1`

**Description**

Document all API endpoints.

**Endpoints to Document**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /agent/store | Store data to Filecoin |
| GET | /agent/retrieve/:pieceCid | Retrieve data with PDP |
| GET | /agent/verify/:pieceCid | Verify PDP proof |
| GET | /agent/vaults/:agentId | List agent's storage manifest |
| POST | /agent/register | Register agent (ERC-8004) |
| GET | /agent/:agentId | Get agent info + card |
| GET | /agent/audit/:agentId | Audit trail |

**Tasks**

- [ ] Create API.md
- [ ] Document request/response for each endpoint
- [ ] Include PDP-related fields
- [ ] Document error codes

**Acceptance Criteria**

- All endpoints documented
- PDP flow documented

---

## Stage 8: ClawVault (OpenClaw Plugin)

### Issue #35: ClawVault plugin scaffold

**Labels:** `stage-8`, `clawvault`, `P1`

**Description**

Create OpenClaw plugin structure for ClawVault.

**Tasks**

- [ ] Create `clawvault/` directory structure
- [ ] Create `clawvault/package.json` with OpenClaw peer dependency
- [ ] Create plugin entry point `clawvault/index.ts`
- [ ] Create AgentVault API client `clawvault/client.ts`
- [ ] Register tools with OpenClaw

**Why ClawVault**

OpenClaw has 180K+ developers but no verifiable identity/storage. Agents can move money but can't prove who they are. ClawVault solves this.

**Acceptance Criteria**

- Plugin loads in OpenClaw
- AgentVault client connects successfully

---

### Issue #36: vault.store() tool

**Labels:** `stage-8`, `clawvault`, `P1`

**Description**

Tool for agents to store verifiable memory.

**Tasks**

- [ ] Create `clawvault/tools/store.ts`
- [ ] Accept data + metadata from agent
- [ ] Sign x402 payment automatically
- [ ] Call AgentVault POST /agent/store
- [ ] Return PieceCID and PDP status

**Tool Signature**

```typescript
@tool vault.store({
  data: string,
  type: 'decision_log' | 'conversation' | 'state',
  description?: string
}) → { pieceCid: string, pdpStatus: string }
```

**Acceptance Criteria**

- Agent can store data with one tool call
- Payment handled automatically
- Returns verifiable CID

---

### Issue #37: vault.recall() tool

**Labels:** `stage-8`, `clawvault`, `P1`

**Description**

Tool for agents to retrieve data with PDP proof.

**Tasks**

- [ ] Create `clawvault/tools/recall.ts`
- [ ] Accept PieceCID or vaultId
- [ ] Sign x402 payment automatically
- [ ] Call AgentVault GET /agent/retrieve
- [ ] Return data + PDP verification status

**Tool Signature**

```typescript
@tool vault.recall({
  pieceCid?: string,
  vaultId?: string
}) → { data: string, pdpVerified: boolean }
```

**Acceptance Criteria**

- Agent can retrieve data with one tool call
- PDP proof status included

---

### Issue #38: vault.identity() tool

**Labels:** `stage-8`, `clawvault`, `P1`

**Description**

Tool for agents to prove/verify ERC-8004 identity.

**Tasks**

- [ ] Create `clawvault/tools/identity.ts`
- [ ] Get own identity: call GET /agent/:agentId
- [ ] Verify other agent: check ERC-8004 registry
- [ ] Return agent card + cardCid

**Tool Signature**

```typescript
@tool vault.identity({
  agentId?: string  // omit for self
}) → { agentId: string, name: string, cardCid: string, verified: boolean }
```

**Acceptance Criteria**

- Agent can prove own identity
- Agent can verify other agent's identity

---

### Issue #39: vault.audit() tool

**Labels:** `stage-8`, `clawvault`, `P1`

**Description**

Tool for agents to view tamper-proof audit trail.

**Tasks**

- [ ] Create `clawvault/tools/audit.ts`
- [ ] Call GET /agent/audit/:agentId
- [ ] Format entries for agent consumption
- [ ] Include summary stats

**Tool Signature**

```typescript
@tool vault.audit({
  agentId?: string,  // omit for self
  limit?: number
}) → { entries: AuditEntry[], summary: object }
```

**Acceptance Criteria**

- Agent can view own audit trail
- Agent can view other agent's public audit trail

---

### Issue #40: OpenClaw integration tests

**Labels:** `stage-8`, `clawvault`, `testing`, `P1`

**Description**

Test ClawVault tools with OpenClaw agent.

**Tasks**

- [ ] Create `clawvault/__tests__/clawvault.test.ts`
- [ ] Test store → recall flow
- [ ] Test identity verification
- [ ] Test audit trail
- [ ] Mock AgentVault API for unit tests

**Acceptance Criteria**

- All tools tested
- Integration with OpenClaw verified

---

### Issue #41: ClawVault demo scenario

**Labels:** `stage-8`, `clawvault`, `demo`, `P1`

**Description**

Demo showing ClawVault in action with OpenClaw agent.

**Tasks**

- [ ] Create `scripts/demo-clawvault.ts`
- [ ] Scene: Agent proves identity with vault.identity()
- [ ] Scene: Agent stores decision with vault.store()
- [ ] Scene: Another agent verifies with vault.recall()
- [ ] Print clear output showing cryptographic trust

**Demo Script**

1. OpenClaw agent registers identity
2. Agent makes decision, stores with vault.store()
3. Second agent verifies first agent with vault.identity()
4. Second agent retrieves decision with vault.recall()
5. Show: "OpenClaw now has cryptographic trust built in"

**Acceptance Criteria**

- Demo runs end-to-end
- Shows value prop: agents can now prove who they are

---

## Quick Reference

### Labels

| Label | Description |
|-------|-------------|
| `P0` | Must have (MVP) |
| `P1` | Should have (core features) |
| `P2` | Nice to have |
| `stage-1` | Project Foundation |
| `stage-2` | X402 Integration |
| `stage-3` | Storage Service (Synapse) |
| `stage-4` | Agent Routes |
| `stage-5` | ERC-8004 Agent Identity |
| `stage-6` | Audit & Verification |
| `stage-7` | Demo & Documentation |
| `stage-8` | ClawVault (OpenClaw Plugin) |

### Issue Count by Stage

| Stage | P0 | P1 | P2 | Total |
|-------|----|----|-----|-------|
| Stage 1 | 4 | 0 | 0 | 4 |
| Stage 2 | 3 | 2 | 0 | 5 |
| Stage 3 | 4 | 2 | 0 | 6 |
| Stage 4 | 2 | 3 | 0 | 5 |
| Stage 5 | 0 | 6 | 0 | 6 |
| Stage 6 | 0 | 3 | 1 | 4 |
| Stage 7 | 3 | 1 | 0 | 4 |
| Stage 8 | 0 | 7 | 0 | 7 |
| **Total** | **16** | **24** | **1** | **41** |
