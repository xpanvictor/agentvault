# AgentVault - Lessons Learned

## Format

```
### [Date] - [Brief Title]
**Context:** What were we trying to do?
**Issue:** What went wrong or was unexpected?
**Resolution:** How did we fix it?
**Lesson:** What should we remember for next time?
```

---

## Lessons

### 2026-02-23 - Use Node Built-ins Over External Dependencies

**Context:** Needed to generate unique vault IDs.

**Resolution:** Used `crypto.randomUUID()` instead of adding `nanoid`.

**Lesson:** Always check Node.js built-ins first. `crypto` provides: `randomUUID()`, `createHash()`, `randomBytes()`.

---

### 2026-02-23 - Add Mock Mode for External Dependencies

**Context:** AgentVault depends on FIL-x402 for payment verification.

**Issue:** Can't test routes locally without FIL-x402 running.

**Resolution:** Added `X402_MOCK=true` config option that skips verification/settlement.

**Lesson:** When integrating with external services, always provide a mock mode for local development. This enables:
- Faster iteration (no need to run dependency)
- CI/CD testing without full stack
- Demo without real payments

---

### 2026-02-23 - Read Dependency Codebase Before Integration

**Context:** Building AgentVault to integrate with FIL-x402.

**Issue:** Initial X402Client was built without fully understanding FIL-x402's API patterns.

**Resolution:** Thoroughly explored FIL-x402 codebase to understand:
- Payment flow (402 → sign → verify → settle)
- Request/response schemas
- Header conventions (`x-payment`)
- Async settlement pattern

**Lesson:** Before integrating with a dependency, read its source code to understand:
- API contracts and schemas
- Design patterns and conventions
- Error handling approaches
- Configuration requirements

---

## Patterns Established

1. **Service Class Pattern:** Constructor takes `Config`, matches FIL-x402 style
2. **Provider Interface:** `IStorageProvider` allows swapping mock → synapse
3. **Barrel Exports:** `index.ts` files for clean imports
4. **402 Payment Flow:** No payment → return requirements, payment → verify → serve → settle async
