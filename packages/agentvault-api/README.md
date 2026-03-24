# @agent_vaults/api-client

Type-safe JavaScript/TypeScript SDK for AgentVault.

This package is designed as a product SDK interface (identity, verifiable memory, payment-assisted storage flow).

## Install

```bash
npm install @agent_vaults/api-client
```

## Exposed Interface

- `AgentVaultClient`: main SDK client
- `AgentVaultError`: structured SDK errors
- `ViemX402PaymentSigner`: drop-in signer for paid operations
- Signing utilities for registration and payment payload creation

## Quick Start

```ts
import {
  AgentVaultClient,
  ViemX402PaymentSigner,
} from "@agentvault/api-client";

const client = new AgentVaultClient({
  baseUrl: "http://localhost:3500",
  paymentSigner: new ViemX402PaymentSigner(process.env.PRIVATE_KEY as `0x${string}`),
});

const health = await client.getHealth();
console.log(health.status);
```

## Core Interface

### 1) Agent identity

```ts
import {
  AgentVaultClient,
  createSignedRegisterAgentRequest,
} from "@agentvault/api-client";

const client = new AgentVaultClient({ baseUrl: "http://localhost:3500" });

const registration = await createSignedRegisterAgentRequest(
  process.env.PRIVATE_KEY as `0x${string}`,
  {
    name: "ResearchAgent",
    version: "1.0.0",
    x402Support: true,
    capabilities: ["analyze", "store"],
  },
);

const agent = await client.registerAgent(registration);
```

### 2) Store and retrieve memory

```ts
const stored = await client.store({
  agentId: agent.agentId,
  data: JSON.stringify({ summary: "daily run", ts: Date.now() }),
  metadata: { type: "state", tags: ["daily", "ops"] },
});

const recalled = await client.retrieve(stored.vaultId);
console.log(recalled.data);
```

### 3) Verification and audit

```ts
const verify = await client.verify(stored.pieceCid);
const vaults = await client.listVaults(agent.agentId);
const audit = await client.getAuditTrail(agent.agentId);
```

### 4) Settlement visibility

```ts
const settlements = await client.listSettlements();
```

## Signer Utilities

### Registration helpers

- `createRegistrationMessage(address)`
- `signRegistrationMessage(privateKey)`
- `createSignedRegisterAgentRequest(privateKey, agentCard)`

### Payment helpers

- `signX402Payment(requirements, privateKey, options)`
- `toPaymentHeader(payment)`
- `ViemX402PaymentSigner`

Use signer options if your verifier expects custom domain values:

```ts
const signer = new ViemX402PaymentSigner(PRIVATE_KEY, {
  tokenName: "USDFC",
  tokenVersion: "1",
});
```

## Error Handling

The SDK throws `AgentVaultError` for non-success responses.

```ts
import { AgentVaultError } from "@agentvault/api-client";

try {
  await client.store({ agentId, data: "payload" });
} catch (error) {
  if (error instanceof AgentVaultError) {
    console.error(error.status, error.code, error.reason);
  }
}
```

## Environment Notes

`AgentVaultClient` resolves base URL in this order:

1. `config.baseUrl`
2. `process.env.BaseAgentVaultUrl`
3. `http://localhost:3500`

## Demo-Style E2E Run

This package includes an integration flow test with optional narrated logs.

```bash
cd packages/agentvault-api
npm install
npm run test:demo
```

Test env template:

- `.env.example` in this package

## API Surface

Main exports from this package:

- `AgentVaultClient`
- `AgentVaultError`
- `ViemX402PaymentSigner`
- `createRegistrationMessage`
- `signRegistrationMessage`
- `createSignedRegisterAgentRequest`
- `signX402Payment`
- `toPaymentHeader`

Backward-compatible aliases are also exported:

- `AgentVaultApiClient`
- `AgentVaultApiError`

## Build and Publish

```bash
cd packages/agentvault-api
npm run clean
npm run typecheck
npm run build
npm pack
```

Then publish from this directory:

```bash
npm publish --access public
```
