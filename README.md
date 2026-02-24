# AgentVault

Verifiable storage for autonomous AI agents on Filecoin with x402 micropayments.

## Setup

### 1. Clone with Submodule
```bash
git clone --recurse-submodules https://github.com/xpanvictor/agentvault
cd agentvault
```

If already cloned:
```bash
git submodule update --init --recursive
```

### 2. Install Dependencies
```bash
# AgentVault
npm install

# FIL-x402
cd FIL-x402/facilitator && npm install && cd ../..
```

### 3. Configure
```bash
cp .env.example .env
```

Edit `.env` and set `FACILITATOR_ADDRESS` to your wallet address.

### 4. Run

**With FIL-x402 (Full Mode):**
```bash
# Terminal 1: FIL-x402
cd FIL-x402/facilitator && npm run dev

# Terminal 2: AgentVault
npm run dev
```

**Without FIL-x402 (Mock Mode):**
```bash
X402_MOCK=true npm run dev
```

## API Endpoints

| Endpoint | Method | Payment | Description |
|----------|--------|---------|-------------|
| `/agent/store` | POST | Required | Store agent data |
| `/agent/retrieve/:id` | GET | Required | Retrieve stored data |
| `/agent/verify/:pieceCid` | GET | Free | Verify PDP proof |
| `/agent/vaults/:agentId` | GET | Free | List agent's vaults |

## Dependencies

- [FIL-x402](https://github.com/bomanaps/FIL-x402) — x402 payment infrastructure (submodule)
- Node.js 20+

## License

MIT
