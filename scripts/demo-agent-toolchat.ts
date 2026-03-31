import { ClawVault } from '../clawvault/src/index.js';

const BASE_URL = process.env.AGENTVAULT_URL ?? 'http://localhost:3500';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const RESEARCH_PK = process.env.AGENT_A_PRIVATE_KEY
  ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANALYST_PK = process.env.AGENT_B_PRIVATE_KEY
  ?? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const PAYMENT_PK = process.env.STORAGE_PRIVATE_KEY;

type VaultToolName = 'vault_store' | 'vault_recall' | 'vault_identity' | 'vault_audit';

type ToolCallLog = {
  at: string;
  agent: string;
  tool: VaultToolName;
  args: Record<string, unknown>;
  ok: boolean;
  resultPreview: string;
};

type ModelStep = {
  text: string;
  toolCalls: Array<{ name: VaultToolName; args: Record<string, unknown> }>;
};

interface AgentModel {
  nextStep(input: {
    role: string;
    objective: string;
    context: string;
    tools: string[];
  }): Promise<ModelStep>;
}

class ScriptedModel implements AgentModel {
  async nextStep(input: {
    role: string;
    objective: string;
    context: string;
    tools: string[];
  }): Promise<ModelStep> {
    const lowerObjective = input.objective.toLowerCase();

    if (lowerObjective.includes('store')) {
      return {
        text: `${input.role}: I will store my decision in the vault and share references.`,
        toolCalls: [
          {
            name: 'vault_identity',
            args: {},
          },
          {
            name: 'vault_store',
            args: {
              data: JSON.stringify({
                topic: 'deployment_decision',
                decision: 'Use AgentVault-backed memory for inter-agent trust',
                confidence: 0.93,
                ts: new Date().toISOString(),
              }),
              type: 'decision_log',
              description: 'Research agent recommendation',
              tags: ['demo', 'agent-to-agent', 'trust'],
            },
          },
          {
            name: 'vault_audit',
            args: { limit: 5 },
          },
        ],
      };
    }

    return {
      text: `${input.role}: I will verify identity, recall the shared memory, and audit provenance.`,
      toolCalls: [
        {
          name: 'vault_identity',
          args: {},
        },
      ],
    };
  }
}

class OpenAICompatibleModel implements AgentModel {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async nextStep(input: {
    role: string;
    objective: string;
    context: string;
    tools: string[];
  }): Promise<ModelStep> {
    const prompt = [
      `You are ${input.role}.`,
      `Objective: ${input.objective}`,
      `Context: ${input.context}`,
      `Available tools: ${input.tools.join(', ')}`,
      'Return ONLY JSON with shape: {"text": string, "toolCalls": [{"name": string, "args": object}]}',
      'Choose only these tool names: vault_store, vault_recall, vault_identity, vault_audit.',
      'Do not wrap in markdown.',
    ].join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error(`Model request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Model returned empty content');
    }

    const parsed = JSON.parse(content) as ModelStep;
    return {
      text: parsed.text,
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
    };
  }
}

class VaultAgent {
  constructor(
    public readonly name: string,
    private readonly vault: ClawVault,
    private readonly model: AgentModel,
    private readonly logs: ToolCallLog[],
  ) {}

  async plan(objective: string, context: string): Promise<ModelStep> {
    return this.model.nextStep({
      role: this.name,
      objective,
      context,
      tools: this.vault.tools.map((t) => t.name),
    });
  }

  async runToolCall(name: VaultToolName, args: Record<string, unknown>): Promise<unknown> {
    const at = new Date().toISOString();
    try {
      const result = await this.vault.callTool(name, args);
      this.logs.push({
        at,
        agent: this.name,
        tool: name,
        args,
        ok: true,
        resultPreview: JSON.stringify(result).slice(0, 220),
      });
      return result;
    } catch (error) {
      this.logs.push({
        at,
        agent: this.name,
        tool: name,
        args,
        ok: false,
        resultPreview: String(error),
      });
      throw error;
    }
  }
}

function printLogs(logs: ToolCallLog[]) {
  console.log('\n=== Tool Call Log ===');
  for (const l of logs) {
    console.log(
      `${l.at} | ${l.agent} | ${l.tool} | ok=${l.ok} | args=${JSON.stringify(l.args)} | result=${l.resultPreview}`,
    );
  }
}

async function main() {
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`AgentVault not reachable at ${BASE_URL}`);
  }

  const health = (await healthRes.json()) as { x402?: { mock?: boolean } };
  const isMock = Boolean(health.x402?.mock);
  if (!isMock && !PAYMENT_PK) {
    throw new Error('Live x402 mode detected. Set STORAGE_PRIVATE_KEY for payment signing.');
  }

  const model: AgentModel = OPENAI_API_KEY
    ? new OpenAICompatibleModel(OPENAI_API_KEY, OPENAI_MODEL)
    : new ScriptedModel();

  const logs: ToolCallLog[] = [];

  const agentA = new VaultAgent(
    'ResearchAgent',
    new ClawVault({
      url: BASE_URL,
      privateKey: RESEARCH_PK,
      paymentKey: PAYMENT_PK,
      agentCard: {
        name: 'ResearchAgent',
        version: '1.0.0',
        x402Support: true,
        capabilities: ['research', 'decision-making'],
      },
    }),
    model,
    logs,
  );

  const agentB = new VaultAgent(
    'AnalysisAgent',
    new ClawVault({
      url: BASE_URL,
      privateKey: ANALYST_PK,
      paymentKey: PAYMENT_PK,
      agentCard: {
        name: 'AnalysisAgent',
        version: '1.0.0',
        x402Support: true,
        capabilities: ['analysis', 'verification'],
      },
    }),
    model,
    logs,
  );

  console.log('Demo start: two agents + vault tools');

  const planA = await agentA.plan(
    'Store a decision in vault and share references with AnalysisAgent',
    'Need a verifiable record for cross-agent trust.',
  );
  console.log(`\n[ResearchAgent] ${planA.text}`);

  let researchIdentity: unknown;
  let stored: unknown;
  for (const call of planA.toolCalls) {
    const out = await agentA.runToolCall(call.name, call.args);
    if (call.name === 'vault_identity') researchIdentity = out;
    if (call.name === 'vault_store') stored = out;
  }

  const storedObj = (stored ?? {}) as { vaultId?: string; pieceCid?: string };
  const researchObj = (researchIdentity ?? {}) as { agentId?: string };

  const messageToB = {
    fromAgentId: researchObj.agentId,
    vaultId: storedObj.vaultId,
    pieceCid: storedObj.pieceCid,
    note: 'Please verify my identity and confirm this memory entry.',
  };
  console.log(`\n[ResearchAgent -> AnalysisAgent] ${JSON.stringify(messageToB)}`);

  console.log('\n[AnalysisAgent] I will verify sender identity, recall data, and check audit trail.');
  const bSelfIdentity = await agentB.runToolCall('vault_identity', {});
  const bVerifySender = await agentB.runToolCall('vault_identity', {
    agentId: messageToB.fromAgentId,
  });
  const bRecall = await agentB.runToolCall('vault_recall', {
    id: messageToB.vaultId ?? messageToB.pieceCid,
  });
  const bAudit = await agentB.runToolCall('vault_audit', {
    agentId: messageToB.fromAgentId,
    limit: 10,
  });

  console.log('\n=== Verification Summary ===');
  console.log('selfIdentity:', bSelfIdentity);
  console.log('senderIdentity:', bVerifySender);
  console.log('recalledRecord:', bRecall);
  console.log('senderAudit:', bAudit);

  printLogs(logs);
  console.log('\nDemo done.');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
