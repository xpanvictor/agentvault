import { ClawVault } from "../../../clawvault/src/index.js";
import type { DemoState, Role, StoredRef, ToolLogEntry } from "./types.js";
import { appendToolLog } from "./io.js";
import { generateText } from "./gemini-http.js";

const BASE_URL = process.env.AGENTVAULT_URL ?? "http://localhost:3500";

const RESEARCH_PK =
  process.env.RESEARCH_AGENT_PK ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INFERENCE_PK =
  process.env.INFERENCE_AGENT_PK ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PAYMENT_PK = process.env.STORAGE_PRIVATE_KEY;

function createVault(role: Role) {
  return new ClawVault({
    url: BASE_URL,
    privateKey: role === "research" ? RESEARCH_PK : INFERENCE_PK,
    paymentKey: PAYMENT_PK,
    agentCard: {
      name: role === "research" ? "ResearchAgent" : "InferenceAgent",
      version: "1.0.0",
      x402Support: true,
      capabilities:
        role === "research"
          ? ["research", "store-findings"]
          : ["inference", "reasoning"],
    },
  });
}

async function runTool<T>(input: {
  role: Role;
  logs: ToolLogEntry[];
  tool: string;
  args: unknown;
  fn: () => Promise<T>;
}): Promise<T> {
  const at = new Date().toISOString();
  try {
    const output = await input.fn();
    const entry: ToolLogEntry = {
      at,
      role: input.role,
      tool: input.tool,
      input: input.args,
      success: true,
      output,
    };
    input.logs.push(entry);
    await appendToolLog(entry);
    return output;
  } catch (error) {
    const out = { error: String(error) };
    const entry: ToolLogEntry = {
      at,
      role: input.role,
      tool: input.tool,
      input: input.args,
      success: false,
      output: out,
    };
    input.logs.push(entry);
    await appendToolLog(entry);
    throw error;
  }
}

export async function runResearchTurn(input: {
  prompt: string;
  state: DemoState;
}): Promise<{ answer: string; logs: ToolLogEntry[]; updatedState: DemoState }> {
  const logs: ToolLogEntry[] = [];
  const role: Role = "research";
  const vault = createVault(role);

  const identity = (await runTool({
    role,
    logs,
    tool: "vault_identity",
    args: {},
    fn: () => vault.callTool("vault_identity", {}),
  })) as { agentId?: string; name?: string };

  const findings = await generateText([
    "You are ResearchAgent.",
    "Create concise but useful findings for the user prompt.",
    "Output plain text only.",
    `User prompt: ${input.prompt}`,
  ]);

  const storeInput = {
    data: JSON.stringify(
      {
        userPrompt: input.prompt,
        findings,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    type: "decision_log" as const,
    description: "Research findings generated from terminal prompt",
    tags: ["demo", "research", "agent-a"],
  };

  const stored = (await runTool({
    role,
    logs,
    tool: "vault_store",
    args: storeInput,
    fn: () => vault.callTool("vault_store", storeInput),
  })) as { vaultId?: string; pieceCid?: string; pdpStatus?: string };

  await runTool({
    role,
    logs,
    tool: "vault_audit",
    args: { limit: 10 },
    fn: () => vault.callTool("vault_audit", { limit: 10 }),
  });

  const updatedState: DemoState = {
    ...input.state,
    researchAgentId: identity.agentId,
    refs: [...input.state.refs],
  };

  if (stored.vaultId && stored.pieceCid) {
    const ref: StoredRef = {
      vaultId: stored.vaultId,
      pieceCid: stored.pieceCid,
      at: new Date().toISOString(),
      description: "Research findings",
    };
    updatedState.refs.push(ref);
  }

  return {
    answer: [
      `Research complete for: ${input.prompt}`,
      "",
      findings,
      "",
      `Stored vaultId: ${stored.vaultId ?? "n/a"}`,
      `Stored pieceCid: ${stored.pieceCid ?? "n/a"}`,
      `PDP status: ${stored.pdpStatus ?? "unknown"}`,
    ].join("\n"),
    logs,
    updatedState,
  };
}

export async function runInferenceTurn(input: {
  prompt: string;
  state: DemoState;
}): Promise<{ answer: string; logs: ToolLogEntry[]; updatedState: DemoState }> {
  const logs: ToolLogEntry[] = [];
  const role: Role = "inference";
  const vault = createVault(role);

  const selfIdentity = (await runTool({
    role,
    logs,
    tool: "vault_identity",
    args: {},
    fn: () => vault.callTool("vault_identity", {}),
  })) as { agentId?: string };

  if (!input.state.refs.length) {
    return {
      answer:
        "No research records found yet. Run `npm run research` first so Agent A stores data in vault.",
      logs,
      updatedState: {
        ...input.state,
        inferenceAgentId: selfIdentity.agentId,
      },
    };
  }

  if (input.state.researchAgentId) {
    await runTool({
      role,
      logs,
      tool: "vault_identity",
      args: { agentId: input.state.researchAgentId },
      fn: () => vault.callTool("vault_identity", { agentId: input.state.researchAgentId }),
    });

    await runTool({
      role,
      logs,
      tool: "vault_audit",
      args: { agentId: input.state.researchAgentId, limit: 10 },
      fn: () =>
        vault.callTool("vault_audit", {
          agentId: input.state.researchAgentId,
          limit: 10,
        }),
    });
  }

  const recalled = [] as Array<{ vaultId: string; pieceCid: string; data: string }>;
  for (const ref of input.state.refs.slice(-3)) {
    const out = (await runTool({
      role,
      logs,
      tool: "vault_recall",
      args: { id: ref.vaultId },
      fn: () => vault.callTool("vault_recall", { id: ref.vaultId }),
    })) as { vaultId?: string; pieceCid?: string; data?: string };

    if (out.data && out.vaultId && out.pieceCid) {
      recalled.push({
        vaultId: out.vaultId,
        pieceCid: out.pieceCid,
        data: out.data,
      });
    }
  }

  const evidence = recalled
    .map((r, i) => `Evidence ${i + 1} (vaultId=${r.vaultId}, pieceCid=${r.pieceCid}):\n${r.data}`)
    .join("\n\n");

  const inference = await generateText([
    "You are InferenceAgent.",
    "Answer the user's question based only on the provided evidence.",
    "If evidence is insufficient, say so clearly.",
    `User question: ${input.prompt}`,
    "",
    "Evidence:",
    evidence,
  ]);

  return {
    answer: [
      `Inference for question: ${input.prompt}`,
      "",
      inference,
      "",
      "Evidence refs used:",
      ...recalled.map((r) => `- vaultId=${r.vaultId}, pieceCid=${r.pieceCid}`),
    ].join("\n"),
    logs,
    updatedState: {
      ...input.state,
      inferenceAgentId: selfIdentity.agentId,
    },
  };
}
