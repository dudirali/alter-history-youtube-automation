import "dotenv/config";

const key = process.env.HEYGEN_API_KEY!;

// Inspect full response shape (look for pagination fields)
const res = await fetch("https://api.heygen.com/v3/voices?engine=starfish", {
  headers: { "x-api-key": key, accept: "application/json" },
});
const json: any = await res.json();
console.log("Top-level keys:", Object.keys(json));
console.log("data length:", json.data?.length);
console.log("Other fields:");
for (const k of Object.keys(json)) {
  if (k === "data") continue;
  console.log(`  ${k}:`, JSON.stringify(json[k]).slice(0, 200));
}

// Try common pagination params one at a time
console.log("\n--- Trying pagination params ---");
for (const qs of [
  "engine=starfish&page=2",
  "engine=starfish&cursor=20",
  "engine=starfish&next_token=20",
  "engine=starfish&offset=20",
  "engine=starfish&start=20",
  "engine=starfish&from=20",
]) {
  const r = await fetch(`https://api.heygen.com/v3/voices?${qs}`, {
    headers: { "x-api-key": key, accept: "application/json" },
  });
  const j: any = await r.json();
  const first = j.data?.[0]?.name;
  console.log(`  ?${qs}\n    → status=${r.status}, count=${j.data?.length ?? 0}, first="${first}"`);
}
