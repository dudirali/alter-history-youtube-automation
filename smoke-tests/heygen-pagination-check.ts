import "dotenv/config";

const key = process.env.HEYGEN_API_KEY!;

const tries = [
  "https://api.heygen.com/v3/voices?engine=starfish",
  "https://api.heygen.com/v3/voices?engine=starfish&limit=500",
  "https://api.heygen.com/v3/voices?engine=starfish&page_size=500",
  "https://api.heygen.com/v3/voices?engine=starfish&page=2",
  "https://api.heygen.com/v3/voices?engine=starfish&offset=100",
];

for (const url of tries) {
  const r = await fetch(url, { headers: { "x-api-key": key, accept: "application/json" }});
  const j: any = await r.json();
  const total = j.data?.length ?? 0;
  const male = j.data?.filter((v: any) => v.gender?.toLowerCase() === "male" && v.language?.toLowerCase().includes("english")).length ?? 0;
  console.log(`${url}\n  → ${total} voices, ${male} English male`);
}
