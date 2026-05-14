import "dotenv/config";

const key = process.env.HEYGEN_API_KEY!;

const endpoints = [
  "https://api.heygen.com/v3/voices",
  "https://api.heygen.com/v3/voices?engine=starfish",
  "https://api.heygen.com/v3/voices/list",
];

for (const url of endpoints) {
  const res = await fetch(url, {
    headers: { "x-api-key": key, accept: "application/json" },
  });
  const text = await res.text();
  console.log(`\n${url}`);
  console.log(`  Status: ${res.status}`);
  console.log(`  Body (first 800 chars): ${text.slice(0, 800)}`);
}
