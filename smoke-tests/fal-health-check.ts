import "dotenv/config";
import { fal } from "@fal-ai/client";

// Quick fal.ai responsiveness check.
// Uses the smallest/cheapest model with a trivial prompt.
// Cost: ~$0.01-0.03, completes in 5-15 seconds normally.

fal.config({ credentials: process.env.FAL_KEY! });

const t0 = Date.now();
console.log(`[health] Submitting tiny SDXL image gen to test fal.ai responsiveness...`);

try {
  const result = (await fal.subscribe("fal-ai/fast-sdxl", {
    input: {
      prompt: "a single red dot",
      image_size: "square_hd",
      num_images: 1,
    },
    logs: false,
  })) as { data: { images: { url: string }[] } };
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[health] ✅ fal.ai responded in ${elapsed}s`);
  console.log(`[health] Output: ${result.data?.images?.[0]?.url ?? "(no url)"}`);
} catch (e: unknown) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`[health] ❌ failed after ${elapsed}s:`, (e as Error).message);
  process.exit(1);
}
