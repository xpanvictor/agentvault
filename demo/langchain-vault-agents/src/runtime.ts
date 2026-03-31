import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { ClawVault } from "../../../clawvault/src/index.js";
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

async function buildTools(role: Role, state: DemoState, logs: ToolLogEntry[]) {
  const vault = createVault(role);

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
      name: "vault_identity",
      description:
        "Get own identity, or lookup another agent by agentId. Use this before trusting shared data.",
      schema: z.object({
        agentId: z.string().optional(),
      }),
      func: async (input: { agentId?: string }) =>
        logAndReturn("vault_identity", input, async () => vault.callTool("vault_identity", input)),
    }),
    new DynamicStructuredTool({
      name: "vault_store",
      description:
        "Store a finding in AgentVault. Use for durable evidence and memory transfer.",
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
        logAndReturn("vault_store", input, async () => vault.callTool("vault_store", input)),
    }),
    new DynamicStructuredTool({
      name: "vault_recall",
      description: "Recall by vaultId or pieceCid.",
      schema: z.object({
        id: z.string(),
      }),
      func: async (input: { id: string }) =>
        logAndReturn("vault_recall", input, async () => vault.callTool("vault_recall", input)),
    }),
    new DynamicStructuredTool({
      name: "vault_audit",
      description: "Get tamper-evident audit entries for self or another agent.",
      schema: z.object({
        agentId: z.string().optional(),
        limit: z.number().int().min(1).optional(),
      }),
      func: async (input: { agentId?: string; limit?: number }) =>
        logAndReturn("vault_audit", input, async () => vault.callTool("vault_audit", input)),
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

  return { vault, tools };
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
  const { vault, tools } = await buildTools(input.role, input.state, logs);

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

  await vault.getAgentId();

  return {
    answer: finalAnswer || "No final answer produced.",
    logs,
    updatedState,
  };
}
