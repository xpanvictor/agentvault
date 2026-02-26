# AgentVault Implementation Plan

## Current Sprint: Agent Routes with FIL-x402 Integration

**Date:** 2026-02-23
**Goal:** Implement core agent routes (#16-19) with proper x402 payment flow alignment
**Status:** COMPLETE

---

## Architecture Overview

```
┌─────────────────┐     x-payment header     ┌─────────────────┐
│                 │ ◄────────────────────────│                 │
│   AI Agent      │                          │   AgentVault    │
│   (Client)      │ ────────────────────────►│   (:3500)       │
│                 │     POST /agent/store    │                 │
└─────────────────┘                          └────────┬────────┘
                                                      │
                                                      │ /verify, /settle
                                                      ▼
                                             ┌─────────────────┐
                                             │   FIL-x402      │
                                             │   (:3402)       │
                                             │                 │
                                             │ - Verify EIP-3009│
                                             │ - Settle on-chain│
                                             │ - Track FCR     │
                                             └─────────────────┘
```

---

## Implementation Checklist

### Phase 0: Type & Config Updates (Alignment) ✅

- [x] Add `PaymentRequirementsSchema` to `types/storage.ts`
- [x] Add `fcr` field to `SettleResponse` in `clients/x402.ts`
- [x] Add `facilitator.address` to `types/config.ts`
- [x] Add `filecoin.chainId` to `types/config.ts`
- [x] Add `x402.mock` for local dev without FIL-x402
- [x] Update `.env.example` with new config fields

### Phase 1: Route Infrastructure ✅

- [x] Create `src/routes/agent.ts` with Hono router
- [x] Create `src/routes/index.ts` barrel export
- [x] Add helper: `extractPaymentHeader(c)` → Payment | null
- [x] Add helper: `buildPaymentRequirements(config, cost)` → PaymentRequirements
- [x] Add helper: `calculateStorageCost(dataSize)` → string (USDFC units)
- [x] Wire routes into `src/index.ts`

### Phase 2: POST /agent/store (Issue #16) ✅

- [x] Parse and validate `StoreRequest` body (Zod)
- [x] Check for `x-payment` header
- [x] If missing: return 402 + PaymentRequirements
- [x] If present: verify via `X402Client.verifyPayment()`
- [x] If invalid: return 400 + error reason
- [x] If valid: call `StorageService.store()`
- [x] Async: call `X402Client.settlePayment()` (fire-and-forget)
- [x] Return `StoreResponse` with vaultId, pieceCid

### Phase 3: GET /agent/retrieve/:id (Issue #17) ✅

- [x] Accept `id` param (vaultId or pieceCid)
- [x] Check for `x-payment` header
- [x] If missing: lookup vault, return 402 + requirements based on size
- [x] If present: verify payment
- [x] If valid: call `StorageService.retrieve()`
- [x] Async settle
- [x] Return `RetrieveResponse` with data

### Phase 4: GET /agent/verify/:pieceCid (Issue #18) ✅

- [x] Accept `pieceCid` param
- [x] NO payment required (free endpoint)
- [x] Call `StorageService.verify()`
- [x] Return `PDPVerifyResponse`

### Phase 5: GET /agent/vaults/:agentId (Issue #19) ✅

- [x] Accept `agentId` param
- [x] NO payment required (free endpoint)
- [x] Call `StorageService.getVaultsForAgent()`
- [x] Return array of vault summaries

### Phase 6: Integration & Testing ✅

- [x] Verify TypeScript compilation
- [x] Manual test: 402 flow (no payment) → Returns PaymentRequirements
- [x] Manual test: store with mock payment header → Returns vaultId, pieceCid
- [x] Manual test: retrieve flow → Returns data
- [x] Manual test: verify endpoint → Returns PDP status
- [x] Manual test: list vaults endpoint → Returns vault array

---

## Test Results

```bash
# 402 Flow (no payment)
POST /agent/store → 402 + {"payTo":"...","maxAmountRequired":"10000",...}

# Store with payment (X402_MOCK=true)
POST /agent/store + x-payment header → 201 + {"success":true,"vaultId":"vault_d2829a4ee891","pieceCid":"bafk287b577ab79da92fcb0bb44e03cc5c6a",...}

# Verify (free)
GET /agent/verify/bafk... → {"exists":true,"pdpVerified":true,...}

# List vaults (free)
GET /agent/vaults/test_agent → {"agentId":"test_agent","vaults":[...],"total":1}

# Retrieve with payment
GET /agent/retrieve/vault_... + x-payment → {"success":true,"data":"Hello AgentVault",...}
```

---

## Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/types/storage.ts` | Modified | Added PaymentRequirementsSchema, removed payment from body schemas |
| `src/types/config.ts` | Modified | Added facilitator, chainId, x402.mock |
| `src/clients/x402.ts` | Modified | Added FCRStatus, updated SettleResponse, settlePayment() |
| `.env.example` | Modified | Added new config fields |
| `src/routes/agent.ts` | Created | All 4 agent endpoints |
| `src/routes/index.ts` | Created | Barrel export |
| `src/index.ts` | Modified | Wired routes, X402Client |
| `src/services/*` | Recreated | Storage service (was deleted) |

---

## Review Section

### What Worked

1. **Mock mode (`X402_MOCK=true`)** - Allows testing without FIL-x402 running
2. **402 flow** - Clean payment requirements response
3. **Zod validation** - Request body validation works correctly
4. **Helper functions** - Reusable across endpoints
5. **Async settlement** - Fire-and-forget doesn't block response

### Issues Encountered

1. **Services directory deleted** - Had to recreate storage service files (likely branch issue)
2. **Shell escaping** - JSON in headers needs careful escaping in curl

### Changes from Plan

1. **Added `x402.mock` config** - Not in original plan, but essential for local dev
2. **Recreated services/** - Original implementation was lost, had to rebuild
3. **Simplified RetrieveRequest** - Removed body, only URL param needed

---

## Sign-Off

- [x] Plan reviewed by user before implementation
- [x] All checklist items complete
- [x] Code compiles without errors
- [x] Server runs and all endpoints tested
- [ ] Lessons captured in `tasks/lessons.md`

---

## Running the Service

### With FIL-x402 (Full Integration)

```bash
# Terminal 1: FIL-x402
cd /Users/mercynaps/x402/FIL-x402/facilitator
npm run dev

# Terminal 2: AgentVault
cd /Users/mercynaps/x402/agentvault
npm run dev
```

### Without FIL-x402 (Mock Mode)

```bash
cd /Users/mercynaps/x402/agentvault
X402_MOCK=true npm run dev
```

---

## Next Steps

- Stage 5: ERC-8004 Agent Identity (#21-26)
- Stage 6: Audit & Cross-Agent Verification (#27-30)
- Stage 7: Demo & Documentation (#31-34)
