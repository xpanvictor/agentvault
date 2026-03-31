# LangChain + Vault Agents Demo

Small standalone demo that uses standard LangChain tools with Gemini and AgentVault.

It gives you two terminal agents:

- Research agent: takes your prompt, researches, stores evidence in vault
- Inference agent: reads research agent vault context and answers your question

Both agents start from empty vault state when you run reset.

## Quick Start: Simple Gemini Chat (No Tools)

If you just want request/response first, use the direct Gemini HTTP mode.

```bash
npm run chat
```

Then type prompts like:

- "hi"
- "what's your name?"
- "what do you do?"

Or one-shot:

```bash
npm run chat -- "hi, what's your name?"
```

This mode uses the same API style as your curl call and does not use LangChain tool-calling.

## 1. Setup

```bash
cd demo/langchain-vault-agents
npm install
cp .env.example .env
```

Set in `.env`:

- `OPENAI_API_KEY` (recommended)
- `ANTHROPIC_API_KEY` (optional fallback)
- `GEMINI_API_KEY` (optional fallback)
- `AGENTVAULT_URL` (default `http://localhost:3500`)
- `STORAGE_PRIVATE_KEY` (required if your AgentVault is in live x402 mode)

Provider selection for `research` and `inference`:

- Uses OpenAI when `OPENAI_API_KEY` is set
- Falls back to Anthropic when only `ANTHROPIC_API_KEY` is set
- Falls back to Gemini when only `GEMINI_API_KEY` is set

## 2. Reset (empty state)

```bash
npm run reset
```

This clears:

- `data/state.json`
- `logs/tool-calls.jsonl`

## 3. Run Research Agent

Interactive:

```bash
npm run research
```

Or direct prompt:

```bash
npm run research -- "Research whether decentralized verifiable storage improves multi-agent trust and store the findings."
```

## 4. Run Inference Agent

Interactive:

```bash
npm run inference
```

Or direct question:

```bash
npm run inference -- "Based on Agent A's vault evidence, should we deploy this in production?"
```

## Tool Call Logging

Every tool call is appended as JSON lines to:

- `logs/tool-calls.jsonl`

And shared references are persisted in:

- `data/state.json`

## Notes

- Uses `@agent_vaults/api-client` as the vault interface source and exposes LangChain tools for:
	`vault_health`, `vault_identity`, `vault_store`, `vault_recall`, `vault_verify`,
	`vault_list_vaults`, `vault_audit`, and `vault_settlements`.
- Uses LangChain chat models: OpenAI / Anthropic / Gemini.
- In live x402 mode, ensure payment key has funds and correct domain settings.
