import { askPrompt, readState, writeState } from "./io.js";
import { runAgentTurn } from "./runtime.js";

async function main() {
  const cliPrompt = process.argv.slice(2).join(" ").trim();
  let state = await readState();

  if (cliPrompt) {
    const result = await runAgentTurn({
      role: "inference",
      userPrompt: cliPrompt,
      state,
    });

    await writeState(result.updatedState);

    console.log("\n=== Inference Agent Answer ===");
    console.log(result.answer);

    console.log("\n=== Tool Calls This Turn ===");
    if (result.logs.length === 0) {
      console.log("- (none)");
    } else {
      for (const l of result.logs) {
        console.log(`- ${l.tool} | ok=${l.success}`);
      }
    }

    console.log("\nState updated at demo/langchain-vault-agents/data/state.json");
    console.log("Tool logs appended to demo/langchain-vault-agents/logs/tool-calls.jsonl");
    return;
  }

  console.log("Inference loop started. Type 'exit' or 'quit' to stop.");
  while (true) {
    const prompt = await askPrompt("Inference question");
    if (!prompt) continue;

    const lower = prompt.toLowerCase();
    if (lower === "exit" || lower === "quit") {
      console.log("Exiting inference loop.");
      break;
    }

    const result = await runAgentTurn({
      role: "inference",
      userPrompt: prompt,
      state,
    });

    state = result.updatedState;
    await writeState(state);

    console.log("\n=== Inference Agent Answer ===");
    console.log(result.answer);

    console.log("\n=== Tool Calls This Turn ===");
    if (result.logs.length === 0) {
      console.log("- (none)");
    } else {
      for (const l of result.logs) {
        console.log(`- ${l.tool} | ok=${l.success}`);
      }
    }

    console.log("\nState updated at demo/langchain-vault-agents/data/state.json");
    console.log("Tool logs appended to demo/langchain-vault-agents/logs/tool-calls.jsonl\n");
  }
}

main().catch((err) => {
  console.error("Inference agent failed:", err);
  process.exit(1);
});
