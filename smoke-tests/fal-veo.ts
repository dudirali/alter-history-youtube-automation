import "dotenv/config";

// fal.ai smoke test (no cost):
// We hit the queue endpoint for Veo 3.1 with a deliberately invalid body.
// • 401 → key is bad
// • 422 / 400 → key is GOOD, body is invalid (= proves auth works for free)
// We also check Kling availability the same way.

async function probeFalModel(
  key: string,
  modelPath: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(`https://queue.fal.run/${modelPath}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}), // intentionally invalid → expect 422
  });
  const body = await res.text();
  return {
    ok: res.status !== 401 && res.status !== 403,
    status: res.status,
    body: body.slice(0, 300),
  };
}

export async function testFal(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.FAL_KEY;
  if (!key) return { ok: false, detail: "FAL_KEY missing in .env" };

  const veo = await probeFalModel(key, "fal-ai/veo3");
  const kling = await probeFalModel(key, "fal-ai/kling-video/v2/master/text-to-video");

  const veoMsg =
    veo.status === 401 || veo.status === 403
      ? `Veo: ❌ auth failed (HTTP ${veo.status})`
      : `Veo: ✅ auth OK (HTTP ${veo.status} from empty body — expected)`;

  const klingMsg =
    kling.status === 401 || kling.status === 403
      ? `Kling: ❌ auth failed (HTTP ${kling.status})`
      : `Kling: ✅ auth OK (HTTP ${kling.status} from empty body — expected)`;

  return {
    ok: veo.ok && kling.ok,
    detail: `fal.ai check:\n     ${veoMsg}\n     ${klingMsg}`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testFal()
    .then((r) => {
      console.log(r.ok ? "✅" : "❌", r.detail);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("❌ fal.ai error:", e?.message ?? e);
      process.exit(1);
    });
}
