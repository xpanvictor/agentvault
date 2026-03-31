import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { DemoState, ToolLogEntry } from "./types.js";

const dataDir = new URL("../data/", import.meta.url);
const logsDir = new URL("../logs/", import.meta.url);
const statePath = new URL("../data/state.json", import.meta.url);
const logPath = new URL("../logs/tool-calls.jsonl", import.meta.url);

const EMPTY_STATE: DemoState = {
  refs: [],
};

export async function ensureDemoDirs() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
}

export async function readState(): Promise<DemoState> {
  await ensureDemoDirs();
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as DemoState;
    return {
      refs: Array.isArray(parsed.refs) ? parsed.refs : [],
      researchAgentId: parsed.researchAgentId,
      inferenceAgentId: parsed.inferenceAgentId,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function writeState(state: DemoState): Promise<void> {
  await ensureDemoDirs();
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

export async function appendToolLog(entry: ToolLogEntry): Promise<void> {
  await ensureDemoDirs();
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function askPrompt(label: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const value = await rl.question(`${label}: `);
    return value.trim();
  } finally {
    rl.close();
  }
}
