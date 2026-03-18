# AgentVault — End-to-End Testing Guide

This guide walks through testing real Filecoin storage, the full x402 payment flow, the dashboard UI, and the ClawVault SDK from scratch.

---

## Part 1 — Prerequisites

### 1.1 Get a funded wallet on Filecoin Calibration testnet

You need a wallet with two tokens:
- **tFIL** — for gas fees (free from faucet)
- **USDFC** — for Synapse storage payments (free from faucet)

**Steps:**

1. Install [MetaMask](https://metamask.io) if you don't have it
2. Add Filecoin Calibration network to MetaMask:
   - Network name: `Filecoin Calibration`
   - RPC URL: `https://api.calibration.node.glif.io/rpc/v1`
   - Chain ID: `314159`
   - Currency symbol: `tFIL`
   - Explorer: `https://calibration.filfox.info`
3. Copy your wallet address (0x...)
4. Get free tFIL from the faucet: https://faucet.calibration.fildev.network
   - Paste your address and request tFIL
   - Wait ~30 seconds for it to arrive
5. Get free USDFC from the same faucet — select USDFC, you need at least 5
6. Export your private key from MetaMask: Settings → Security → Export Private Key
   - It will start with `0x`
   - **Never share this key or commit it to git**

---

## Part 2 — Configure the Project

### 2.1 Set environment variables

Open `.env` and set:

```env
STORAGE_PROVIDER=synapse
STORAGE_PRIVATE_KEY=0xYourPrivateKeyHere

IDENTITY_ENABLED=true

X402_MOCK=true
FACILITATOR_ADDRESS=0xYourWalletAddress

FILECOIN_NETWORK=calibration
FILECOIN_CHAIN_ID=314159
FILECOIN_RPC_URL=wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1
```

> `X402_MOCK=true` keeps payment verification in mock mode so you don't need a running FIL-x402 server. You are only testing real Filecoin storage here.

### 2.2 Deposit USDFC into the Synapse payment contract (one-time)

This deposits 5 USDFC on-chain so the Synapse SDK can pay for storage deals.

```bash
npm run setup:synapse
```

Expected output:
```
Synapse payment setup
Wallet : 0xYourAddress
Network: Filecoin Calibration testnet
Deposit: 5 USDFC

Depositing 5 USDFC into Synapse payment contract...
✓ Transaction submitted: 0xabc123...
  View on Filfox: https://calibration.filfox.info/en/tx/0xabc123...

Waiting for confirmation...
✓ Confirmed! Lockup balance: 5 USDFC

You can now run: npm run dev  then  npm run demo
```

If it says `Already have sufficient lockup balance` — you are good, skip to Part 3.

If it says `Insufficient wallet USDFC` — go back to step 1.5 and get more USDFC from the faucet.

---

## Part 3 — Start the Application

### 3.1 Start everything with one command

```bash
npm run demo:start
```

This will:
- Clear ports 3402, 3500, 5173
- Start FIL-x402 payment infra on `:3402`
- Start AgentVault API on `:3500`
- Start the frontend dashboard on `:5173`
- Run the demo script (Scenes 1–4)

Watch the output — it should say:
```
✓ FIL-x402 facilitator running
✓ AgentVault running  →  storage=synapse  x402.mock=true
✓ Frontend running  →  http://localhost:5173
```

### 3.2 Open the dashboard

Go to http://localhost:5173

On the **Dashboard** page confirm:
- Storage provider shows `synapse` (not `mock`)
- Status dot is green / Operational

---

## Part 4 — Test a Real Upload

### 4.1 Register an agent

```bash
curl -X POST http://localhost:3500/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYourWalletAddress",
    "agentCard": {
      "name": "TestAgent",
      "version": "1.0.0",
      "x402Support": true
    },
    "signature": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  }'
```

Copy the `agentId` from the response — it looks like `agent_a1b2c3d4`.

### 4.2 Store data on Filecoin

Step 1 — trigger the 402 to confirm the payment requirement:

```bash
curl -X POST http://localhost:3500/agent/store \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_YOURID","data":"Hello Filecoin from AgentVault"}'
```

You will get a `402` back with `payTo`, `maxAmountRequired`, `tokenAddress`, `chainId`.

Step 2 — store with the mock payment header:

```bash
curl -X POST http://localhost:3500/agent/store \
  -H "Content-Type: application/json" \
  -H "x-payment: mock-payment-header" \
  -d '{
    "agentId": "agent_YOURID",
    "data": "Hello Filecoin from AgentVault",
    "metadata": { "type": "decision_log" }
  }'
```

Expected response:

```json
{
  "vaultId": "vault_abc123",
  "pieceCid": "bafk2bzaced...",
  "agentId": "agent_YOURID",
  "storedAt": "2026-...",
  "size": 30,
  "pdpStatus": "pending"
}
```

`pdpStatus: pending` is expected — Filecoin storage proofs take a few minutes to confirm.

### 4.3 Check the PieceCID on Filfox

Go to:

```
https://calibration.filfox.info/en/message/bafk2bzaced...
```

Replace `bafk2bzaced...` with your actual `pieceCid`. If the deal is visible on Filfox the data is on-chain.

### 4.4 Verify via the API

```bash
curl http://localhost:3500/agent/verify/bafk2bzaced...
```

After 5–10 minutes `pdpVerified` should flip to `true`:

```json
{
  "exists": true,
  "pieceCid": "bafk2bzaced...",
  "pdpVerified": true,
  "pdpVerifiedAt": "2026-..."
}
```

---

## Part 5 — Verify in the Dashboard

### 5.1 Vault Explorer

1. Go to http://localhost:5173/vaults
2. Enter your `agentId` → click **Load**
3. Your vault row should appear with the `pieceCid` linking to Filfox
4. Click **Verify** to manually trigger a PDP check — the badge updates live

### 5.2 Audit Trail

1. Go to http://localhost:5173/audit
2. Enter your `agentId` → click **Load**
3. A timeline entry for the `store` operation appears with the `pieceCid` and size

### 5.3 Agent Lookup

1. Go to http://localhost:5173/agent
2. Enter your `agentId`
3. You should see the agent card, reputation score, and storage manifest listing your vault

### 5.4 Settlements

1. Go to http://localhost:5173/settlements
2. Your payment record should appear — status `settled` (mock mode settles immediately)

---

## Part 6 — Test ClawVault SDK

ClawVault wraps all the above into 4 tool calls with zero HTTP boilerplate.

### 6.1 Run the ClawVault demo

Make sure the servers are still running from Part 3:

```bash
npm run demo:clawvault
```

This runs Scene 5 which:
1. Creates a ClawVault instance pointed at `:3500`
2. `vault.identity()` — registers the agent with ERC-8004
3. `vault.store()` — stores data with automatic x402 payment signing
4. `vault.recall()` — retrieves the data back
5. `vault.audit()` — prints the tamper-evident operation history

Watch for the `pieceCid` in the output — that CID is your data on Filecoin.

### 6.2 Use ClawVault programmatically

Create a test file:

```ts
import { ClawVault } from './clawvault/src/index.js';

const vault = new ClawVault({
  serverUrl: 'http://localhost:3500',
  privateKey: '0xYourPrivateKey',
});

// Register agent
const identity = await vault.identity();
console.log('Agent ID:', identity.agentId);

// Store data on Filecoin
const stored = await vault.store({
  data: 'My first verifiable memory',
  metadata: { type: 'decision_log' },
});
console.log('Vault ID: ', stored.vaultId);
console.log('PieceCID:', stored.pieceCid);
console.log('PDP status:', stored.pdpStatus);

// Retrieve it back
const recalled = await vault.recall({ vaultId: stored.vaultId });
console.log('Retrieved data:', recalled.data);

// Full audit trail
const audit = await vault.audit();
console.log('Total operations:', audit.summary.totalOperations);
```

Run it:

```bash
npx tsx your-test-file.ts
```

---

## Part 7 — Confirm Storage is Real

After 5–10 minutes, run the verify endpoint one more time:

```bash
curl http://localhost:3500/agent/verify/bafk2bzaced...
```

When `pdpVerified: true` appears — your data is cryptographically proven to be stored on Filecoin Calibration testnet.

You can also confirm on-chain at:

```
https://calibration.filfox.info/en/message/bafk2bzaced...
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `setup:synapse` says "Insufficient USDFC" | Not enough USDFC in wallet | Get more from the Calibration faucet |
| Store returns 500 | Synapse SDK auth failed | Check `STORAGE_PRIVATE_KEY` in `.env` |
| `pdpStatus` stays `pending` forever | Storage deal not confirmed yet | Wait 10+ min, run verify again |
| Dashboard shows `storage=mock` | `STORAGE_PROVIDER` not set to `synapse` | Check `.env`, restart the server |
| `demo:clawvault` fails "connection refused" | Servers not running | Run `npm run demo:start` first |
| Filfox shows no deal for the CID | Upload failed silently | Check server logs at `/tmp/agentvault.log` |

---

## Stop Everything

```bash
npm run demo:stop
```

Kills ports 3402, 3500, and 5173.
