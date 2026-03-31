import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  AgentVaultClient,
  ViemX402PaymentSigner,
  createSignedRegisterAgentRequest,
} from "../../../packages/agentvault-api/src/index.js";
import type { Role, DemoState, ToolLogEntry, StoredRef } from "./types.js";
import { appendToolLog } from "./io.js";

const BASE_URL = process.env.AGENTVAULT_URL ?? "http://localhost:3500";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const RESEARCH_PK =
  process.env.RESEARCH_AGENT_PK ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const INFERENCE_PK =
  process.env.INFERENCE_AGENT_PK ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PAYMENT_PK = process.env.STORAGE_PRIVATE_KEY;
const TOKEN_NAME = process.env.AGENTVAULT_TEST_TOKEN_NAME ?? "USD for Filecoin Community";
const TOKEN_VERSION = process.env.AGENTVAULT_TEST_TOKEN_VERSION ?? "1";

function createSdkClient(role: Role) {
  const identityPrivateKey =
    (role === "research" ? RESEARCH_PK : INFERENCE_PK) as `0x${string}`;
  const paymentPrivateKey =
    (PAYMENT_PK ?? identityPrivateKey) as `0x${string}`;

  const client = new AgentVaultClient({
    baseUrl: BASE_URL,
    paymentSigner: new ViemX402PaymentSigner(paymentPrivateKey, {
      tokenName: TOKEN_NAME,
      tokenVersion: TOKEN_VERSION,
    }),
  });

  return {
    client,
    identityPrivateKey,
    defaultCard: {
      name: role === "research" ? "ResearchAgent" : "InferenceAgent",
      version: "1.0.0",
      x402Support: true,
      capabilities:
        role === "research"
          ? ["research", "store-findings"]
          : ["inference", "reasoning"],
    },
  };
}

async function buildTools(role: Role, state: DemoState, logs: ToolLogEntry[]) {
  const { client, identityPrivateKey, defaultCard } = createSdkClient(role);
  let selfAgentId: string | undefined =
    role === "research" ? state.researchAgentId : state.inferenceAgentId;

  const ensureRegistered = async (): Promise<string> => {
    if (selfAgentId) {
      const existing = await client.getAgent(selfAgentId);
      if (existing.found) return selfAgentId;
    }

    const payload = await createSignedRegisterAgentRequest(
      identityPrivateKey,
      defaultCard,
    );
    const registered = await client.registerAgent(payload);
    selfAgentId = registered.agentId;
    return selfAgentId;
  };

  const logAndReturn = async (
    tool: string,
    input: unknown,
    fn: () => Promise<unknown>,
  ): Promise<string> => {
    const at = new Date().toISOString();
    try {
      const output = await fn();
      const entry: ToolLogEntry = { at, role, tool, input, success: true, output };
      logs.push(entry);
      await appendToolLog(entry);
      return JSON.stringify(output);
    } catch (error) {
      const output = { error: String(error) };
      const entry: ToolLogEntry = { at, role, tool, input, success: false, output };
      logs.push(entry);
      await appendToolLog(entry);
      return JSON.stringify(output);
    }
  };

  const tools = [
    new DynamicStructuredTool({
      name: "vault_health",
      description: "Get AgentVault health and x402/storage mode.",
      schema: z.object({}),
      func: async (input: Record<string, never>) =>
        logAndReturn("vault_health", input, async () => client.getHealth()),
    }),
    new DynamicStructuredTool({
      name: "vault_identity",
      description:
        "Get own identity, or lookup another agent by agentId. Auto-registers self if needed.",
      schema: z.object({
        agentId: z.string().optional(),
      }),
      func: async (input: { agentId?: string }) =>
        logAndReturn("vault_identity", input, async () => {
          const targetAgentId = input.agentId ?? (await ensureRegistered());
          const result = await client.getAgent(targetAgentId);
          if (!result.found || !result.agent) {
            return {
              agentId: targetAgentId,
              verified: false,
            };
          }
          const card = result.agent.agentCard as unknown as Record<string, unknown>;
          return {
            agentId: result.agent.agentId,
            address: result.agent.address,
            name: (card.name as string) ?? "",
            version: (card.version as string) ?? "",
            cardCid: result.agent.cardCid,
            registeredAt: result.agent.registeredAt,
            x402Support: (card.x402Support as boolean) ?? false,
            storageVaultCount: result.agent.storageManifest.length,
            reputation: result.agent.reputation,
            verified: true,
          };
        }),
    }),
    new DynamicStructuredTool({
      name: "vault_store",
      description: "Store data in AgentVault with automatic x402 payment handling.",
      schema: z.object({
        data: z.string(),
        type: z
          .enum(["decision_log", "conversation", "dataset", "state", "other"])
          .optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      func: async (input: {
        data: string;
        type?: "decision_log" | "conversation" | "dataset" | "state" | "other";
        description?: string;
        tags?: string[];
      }) =>
        logAndReturn("vault_store", input, async () => {
          const agentId = await ensureRegistered();
          const result = await client.store({
            agentId,
            data: input.data,
            metadata: {
              type: input.type ?? "other",
              description: input.description,
              tags: input.tags,
            },
          });
          return {
            vaultId: result.vaultId,
            pieceCid: result.pieceCid,
            size: result.size,
            pdpStatus: result.pdpStatus,
            paymentId: result.paymentId,
          };
        }),
    }),
    new DynamicStructuredTool({
      name: "vault_recall",
      description: "Recall by vaultId or pieceCid.",
      schema: z.object({
        id: z.string(),
      }),
      func: async (input: { id: string }) =>
        logAndReturn("vault_recall", input, async () => client.retrieve(input.id)),
    }),
    new DynamicStructuredTool({
      name: "vault_verify",
      description: "Verify a piece CID PDP state.",
      schema: z.object({
        pieceCid: z.string(),
      }),
      func: async (input: { pieceCid: string }) =>
        logAndReturn("vault_verify", input, async () => client.verify(input.pieceCid)),
    }),
    new DynamicStructuredTool({
      name: "vault_list_vaults",
      description: "List vault entries for self or a target agent.",
      schema: z.object({
        agentId: z.string().optional(),
      }),
      func: async (input: { agentId?: string }) =>
        logAndReturn("vault_list_vaults", input, async () => {
          const targetAgentId = input.agentId ?? (await ensureRegistered());
          return client.listVaults(targetAgentId);
        }),
    }),
    new DynamicStructuredTool({
      name: "vault_audit",
      description: "Get tamper-evident audit entries for self or another agent.",
      schema: z.object({
        agentId: z.string().optional(),
        limit: z.number().int().min(1).optional(),
      }),
      func: async (input: { agentId?: string; limit?: number }) =>
        logAndReturn("vault_audit", input, async () => {
          const targetAgentId = input.agentId ?? (await ensureRegistered());
          const result = await client.getAuditTrail(targetAgentId);
          if (input.limit && input.limit > 0) {
            return {
              ...result,
              entries: result.entries.slice(-input.limit),
            };
          }
          return result;
        }),
    }),
    new DynamicStructuredTool({
      name: "vault_settlements",
      description: "List settlements or get one settlement by paymentId.",
      schema: z.object({
        status: z.enum(["pending", "settled", "failed"]).optional(),
        paymentId: z.string().optional(),
      }),
      func: async (input: {
        status?: "pending" | "settled" | "failed";
        paymentId?: string;
      }) =>
        logAndReturn("vault_settlements", input, async () => {
          if (input.paymentId) {
            return client.getSettlement(input.paymentId);
          }
          return client.listSettlements(input.status);
        }),
    }),
    new DynamicStructuredTool({
      name: "shared_state",
      description:
        "Read known shared state including research agent id and stored refs from previous runs.",
      schema: z.object({}),
      func: async (input: Record<string, never>) =>
        logAndReturn("shared_state", input, async () => ({
          researchAgentId: state.researchAgentId,
          inferenceAgentId: state.inferenceAgentId,
          refs: state.refs,
        })),
    }),
  ];

  return {
    tools,
    getSelfAgentId: () => selfAgentId,
  };
}

export async function runAgentTurn(input: {
  role: Role;
  userPrompt: string;
  state: DemoState;
}): Promise<{
  answer: string;
  logs: ToolLogEntry[];
  updatedState: DemoState;
}> {
  if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.");
  }

  const logs: ToolLogEntry[] = [];
  const { tools, getSelfAgentId } = await buildTools(input.role, input.state, logs);

  const llm = OPENAI_API_KEY
    ? new ChatOpenAI({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        temperature: 0.2,
      })
    : ANTHROPIC_API_KEY
      ? new ChatAnthropic({
          apiKey: ANTHROPIC_API_KEY,
          model: ANTHROPIC_MODEL,
          temperature: 0.2,
        })
      : new ChatGoogleGenerativeAI({
          apiKey: GEMINI_API_KEY,
          model: MODEL,
          temperature: 0.2,
        });
  const llmWithTools = llm.bindTools(tools);

  const systemPrompt =
    input.role === "research"
      ? [
          "You are ResearchAgent.",
          "Goal: research based on user prompt and persist findings in the vault using vault_store.",
          "Always call vault_identity at least once first.",
          "When useful, call vault_audit to show traceability.",
          "Return concise summary for terminal output.",
        ].join("\n")
      : [
          "You are InferenceAgent.",
          "Goal: answer the user question using evidence from ResearchAgent vault entries.",
          "Always call shared_state first, then vault_identity and vault_recall on relevant refs.",
          "Use vault_audit for provenance checks.",
          "If no refs exist, clearly say research agent must store data first.",
          "Return concise summary for terminal output with evidence references.",
        ].join("\n");

  const messages: Array<SystemMessage | HumanMessage | ToolMessage | any> = [
    new SystemMessage(systemPrompt),
    new HumanMessage(input.userPrompt),
  ];

  let finalAnswer = "";

  for (let i = 0; i < 8; i += 1) {
    const aiMsg: any = await llmWithTools.invoke(messages as any);
    messages.push(aiMsg);

    const toolCalls: any[] = Array.isArray(aiMsg.tool_calls) ? aiMsg.tool_calls : [];
    if (toolCalls.length === 0) {
      finalAnswer = typeof aiMsg.content === "string" ? aiMsg.content : JSON.stringify(aiMsg.content);
      break;
    }

    for (const tc of toolCalls) {
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool) {
        messages.push(
          new ToolMessage({
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
          }),
        );
        continue;
      }

      const result = await (tool as any).invoke(tc.args ?? {});
      messages.push(
        new ToolMessage({
          tool_call_id: tc.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        }),
      );
    }
  }

  const updatedState: DemoState = {
    ...input.state,
    refs: [...input.state.refs],
  };

  const idLog = logs
    .filter((l) => l.tool === "vault_identity" && l.success)
    .map((l) => l.output as { agentId?: string });
  const storeLog = logs
    .filter((l) => l.tool === "vault_store" && l.success)
    .map((l) => l.output as { vaultId?: string; pieceCid?: string });

  if (input.role === "research") {
    const firstId = idLog.find((x) => x?.agentId)?.agentId;
    if (firstId) updatedState.researchAgentId = firstId;

    const newRefs: StoredRef[] = storeLog
      .filter((x) => x.vaultId && x.pieceCid)
      .map((x) => ({
        vaultId: x.vaultId as string,
        pieceCid: x.pieceCid as string,
        at: new Date().toISOString(),
      }));
    updatedState.refs.push(...newRefs);
  } else {
    const firstId = idLog.find((x) => x?.agentId)?.agentId;
    if (firstId) updatedState.inferenceAgentId = firstId;
  }

  const selfAgentId = getSelfAgentId();
  if (selfAgentId) {
    if (input.role === "research") updatedState.researchAgentId = selfAgentId;
    if (input.role === "inference") updatedState.inferenceAgentId = selfAgentId;
  }

  return {
    answer: finalAnswer || "No final answer produced.",
    logs,
    updatedState,
  };
}
