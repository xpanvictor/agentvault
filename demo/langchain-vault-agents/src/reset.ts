import { writeFile, mkdir } from "node:fs/promises";

async function main() {
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await mkdir(new URL("../logs/", import.meta.url), { recursive: true });

  await writeFile(
    new URL("../data/state.json", import.meta.url),
    JSON.stringify({ refs: [] }, null, 2),
    "utf8",
  );

  await writeFile(new URL("../logs/tool-calls.jsonl", import.meta.url), "", "utf8");

  console.log("Demo state reset.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
