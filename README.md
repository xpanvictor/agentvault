# AgentVault + ClawVault

**Verifiable storage and identity for autonomous AI agents on Filecoin.**

---

## The Problem

AI agents can move money but can't prove who they are. There's no tamper-proof memory, no verifiable identity, no way for Agent B to trust Agent A's claimed output.

## The Solution

**AgentVault** is a backend protocol that gives agents:
- Verifiable storage on Filecoin with PDP proofs
- ERC-8004 on-chain identity
- x402 micropayments for autonomous storage purchases
- Tamper-proof audit trails

**ClawVault** is an OpenClaw plugin that brings these capabilities to 180K+ developers with simple tools:
- `vault.store()` — Store agent memory verifiably
- `vault.recall()` — Retrieve with cryptographic proof
- `vault.identity()` — Prove/verify agent identity
- `vault.audit()` — View tamper-proof history

## Architecture

```
ClawVault (OpenClaw Plugin)
        ↓
AgentVault (:3500) — Backend Protocol
        ↓
┌───────────────┬───────────────┬───────────────┐
│   FIL-x402    │  Filecoin     │   ERC-8004    │
│   Payments    │  Storage/PDP  │   Identity    │
└───────────────┴───────────────┴───────────────┘
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/xpanvictor/agentvault
cd agentvault
npm install

# Configure
cp .env.example .env

# Run (requires FIL-x402 on :3402)
npm run dev
```

## Dependencies

- [FIL-x402](https://github.com/bomanaps/FIL-x402) — x402 payment infrastructure
- Node.js 20+
- Filecoin Calibration testnet

## Status

Building for PL Genesis hackathon (Feb 10 – Mar 16, 2026).

## License

MIT
