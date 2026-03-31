import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_HTTP_MODEL ?? "gemini-flash-latest";

if (!API_KEY) {
  console.error("GEMINI_API_KEY is required.");
  process.exit(1);
}
const RESOLVED_API_KEY: string = API_KEY;

type GeminiPart = { text: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

const history: GeminiContent[] = [];

async function askGemini(prompt: string): Promise<string> {
  history.push({ role: "user", parts: [{ text: prompt }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": RESOLVED_API_KEY,
      },
      body: JSON.stringify({
        contents: history,
      }),
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${raw}`);
  }

  const json = JSON.parse(raw) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Gemini returned no text content.");
  }

  history.push({ role: "model", parts: [{ text }] });
  return text;
}

async function main() {
  const cliPrompt = process.argv.slice(2).join(" ").trim();
  if (cliPrompt) {
    const answer = await askGemini(cliPrompt);
    console.log(answer);
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`Simple Gemini chat ready (${MODEL}). Type 'exit' to quit.`);

  try {
    while (true) {
      const input = (await rl.question("You: ")).trim();
      if (!input) continue;
      if (input.toLowerCase() === "exit") break;

      try {
        const answer = await askGemini(input);
        console.log(`Gemini: ${answer}`);
      } catch (error) {
        console.error(`Gemini request failed: ${String(error)}`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Chat failed:", error);
  process.exit(1);
});
