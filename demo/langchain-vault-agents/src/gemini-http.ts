const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_HTTP_MODEL ?? "gemini-flash-latest";

if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is required.");
}

const RESOLVED_API_KEY: string = API_KEY;

export async function generateText(parts: string[]): Promise<string> {
  const prompt = parts.join("\n\n");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": RESOLVED_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
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

  return text;
}
