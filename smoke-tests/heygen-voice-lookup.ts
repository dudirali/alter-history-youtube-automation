import "dotenv/config";

// Look up the chosen voice and discover available TTS engines.

const TARGET_VOICE_ID =
  "8a8fb6db01a44463a087e68f54d0870b-f4ffc86b-6040-428f-b71f-d1244273c488";

interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  preview_audio?: string;
  support_pause?: boolean;
  emotion_support?: boolean;
  engine?: string;
  // Some voices have additional fields
  [key: string]: unknown;
}

async function run() {
  const key = process.env.HEYGEN_API_KEY!;

  // Get the full voice list
  const res = await fetch("https://api.heygen.com/v2/voices", {
    headers: { "x-api-key": key, accept: "application/json" },
  });
  const json: { data?: { voices: HeyGenVoice[] } } = await res.json();
  const voices = json.data?.voices ?? [];
  console.log(`Total voices: ${voices.length}`);

  // 1) Look up the chosen voice
  const target = voices.find((v) => v.voice_id === TARGET_VOICE_ID);
  if (!target) {
    console.log(`\n❌ Target voice NOT FOUND in /v2/voices list`);
    return;
  }
  console.log(`\n=== Chosen voice metadata ===`);
  console.log(JSON.stringify(target, null, 2));

  // 2) Discover what engine field values exist across all voices
  const engineCounts = new Map<string, number>();
  for (const v of voices) {
    const eng = (v.engine as string) ?? "(no engine field)";
    engineCounts.set(eng, (engineCounts.get(eng) ?? 0) + 1);
  }
  console.log(`\n=== Engine distribution across all voices ===`);
  for (const [eng, count] of [...engineCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${count.toString().padStart(5)}  ${eng}`);
  }

  // 3) Among starfish voices, show top English female options
  const starfishEnglishFemale = voices.filter(
    (v) =>
      (v.engine as string)?.toLowerCase() === "starfish" &&
      v.language?.toLowerCase().includes("english") &&
      v.gender?.toLowerCase() === "female"
  );
  console.log(
    `\n=== Starfish + English + Female: ${starfishEnglishFemale.length} voices ===`
  );
  for (const v of starfishEnglishFemale.slice(0, 15)) {
    console.log(
      `  ${v.name.padEnd(30)} ${v.voice_id}  ${
        v.emotion_support ? "[emotion]" : ""
      }`
    );
    if (v.preview_audio) console.log(`     preview: ${v.preview_audio}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
