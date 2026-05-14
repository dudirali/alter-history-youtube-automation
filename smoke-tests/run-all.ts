import "dotenv/config";
import { testAnthropic } from "./anthropic.ts";
import { testHeygen } from "./heygen.ts";
import { testFal } from "./fal-veo.ts";

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

async function safeRun(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string }>
): Promise<Result> {
  try {
    const r = await fn();
    return { name, ...r };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, ok: false, detail: `Threw: ${msg}` };
  }
}

const results = await Promise.all([
  safeRun("Anthropic", testAnthropic),
  safeRun("HeyGen   ", testHeygen),
  safeRun("fal.ai   ", testFal),
]);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(" API Smoke Test Results");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}  ${r.detail}\n`);
}

const allOk = results.every((r) => r.ok);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(
  allOk
    ? "🎉 All systems go — ready for Phase 1"
    : "⚠️  Fix the failures above before proceeding"
);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

process.exit(allOk ? 0 : 1);
