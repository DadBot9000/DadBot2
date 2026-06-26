// api/dadbot.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

/**
 * Normalize aggressively so "same joke" matches even if punctuation/emoji differs.
 */
function norm(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "") // strip punctuation/symbols
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Near-duplicate check: rejects rephrases that share too many words.
 * (Cheap + effective; avoids needing embeddings.)
 */
function tooSimilar(aNorm: string, bNorm: string) {
  const aWords = aNorm.split(" ").filter(Boolean);
  const bWords = bNorm.split(" ").filter(Boolean);
  if (!aWords.length || !bWords.length) return false;

  const aSet = new Set(aWords);
  const bSet = new Set(bWords);

  let overlap = 0;
  for (const w of aSet) if (bSet.has(w)) overlap++;

  const denom = Math.min(aSet.size, bSet.size);
  const ratio = denom === 0 ? 0 : overlap / denom;

  // tune threshold: 0.75 catches many paraphrases without being too strict
  return ratio >= 0.75;
}

/**
 * Vercel sometimes gives req.body as a string.
 */
function getJsonBody(req: VercelRequest): any {
  const b: any = (req as any).body;
  if (!b) return {};
  if (typeof b === "object") return b;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Splits model output into candidate jokes.
 * Supports outputs like:
 * - "1) joke...\n2) joke...\n..."
 * - "- joke...\n- joke..."
 * - plain multi-line
 */
function extractCandidates(text: string): string[] {
  const raw = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // remove numbering / bullets
  const cleaned = raw
    .map((l) => l.replace(/^(\d+[\).\]]\s+|[-•]\s+)/, "").trim())
    .filter(Boolean);

  // Some models may return everything in one line separated by " | "
  const expanded: string[] = [];
  for (const line of cleaned) {
    if (line.includes(" | ")) {
      expanded.push(
        ...line
          .split(" | ")
          .map((x) => x.trim())
          .filter(Boolean)
      );
    } else {
      expanded.push(line);
    }
  }

  // final cleanup
  return expanded
    .map((x) => x.replace(/^"+|"+$/g, "").trim())
    .filter((x) => x.length >= 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // prevent caching
  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST", version: "dadbot-api-v3-2026-01-30" });

    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const body = getJsonBody(req);
    const query = body?.query;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing query" });
    }

    const avoidRaw = body?.avoidJokes;
    const avoid: string[] = Array.isArray(avoidRaw)
      ? avoidRaw.filter((x: any) => typeof x === "string").slice(0, 120)
      : [];

    const avoidNormList = avoid.map(norm).filter(Boolean);
    const avoidNormSet = new Set(avoidNormList);

    const client = new OpenAI({ apiKey });

    // nonce helps push variety for identical repeated prompts
    const requestId =
      typeof body?.requestId === "string"
        ? body.requestId
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // multiple "angles" to force different joke structures
    const angles = [
      "question format",
      "one-liner",
      "two-liner",
      "misdirection",
      "pun-heavy wordplay",
      "absurd dad twist",
      "dry sarcastic dad humor",
      "wholesome dad joke",
    ];

    const MAX_ATTEMPTS = 5;
    const BATCH_SIZE = 12; // how many jokes we ask for at once

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const angle = angles[(attempt - 1) % angles.length];

      // Ask for a batch in a single completion (more controllable than n=12 sometimes)
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 1.35,
        max_tokens: 250,
        presence_penalty: 0.9,
        frequency_penalty: 0.8,
        messages: [
          {
            role: "system",
            content:
              "You are DadBot9000. You MUST output ONLY dad jokes, no explanations. " +
              "Return multiple options, each on its own line. No intro text.",
          },
          {
            role: "user",
            content:
              `Topic: ${query.trim()}\n` +
              `Nonce: ${requestId}\n` +
              `Style/Angle: ${angle}\n\n` +
              `Generate ${BATCH_SIZE} DIFFERENT short dad jokes about the topic.\n` +
              (avoid.length
                ? `IMPORTANT: Do NOT repeat or closely rephrase ANY of these avoided jokes:\n- ${avoid.join(
                    "\n- "
                  )}\n\n`
                : "") +
              "Rules:\n" +
              "- Output ONLY the jokes (one per line)\n" +
              "- No numbering, no bullets\n" +
              "- Keep them short\n",
          },
        ],
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!text) continue;

      const candidates = extractCandidates(text);
      if (!candidates.length) continue;

      // Filter: exact duplicates + near duplicates
      for (const candidate of candidates) {
        const k = norm(candidate);
        if (!k) continue;

        // exact normalized match
        if (avoidNormSet.has(k)) continue;

        // near-duplicate match
        let similar = false;
        for (const a of avoidNormList) {
          if (tooSimilar(k, a)) {
            similar = true;
            break;
          }
        }
        if (similar) continue;

        // ✅ Found a fresh joke
        return res.status(200).json({
  joke: candidate.trim(),
  avoidCount: avoid.length,
  attempt,
  angle,
  version: "dadbot-api-v3-2026-01-30",
});
      }
    }

    // If we got here, backend truly couldn't find anything fresh
    return res.status(409).json({
      error:
        "I’m running out of fresh punchlines for that exact word 😅 Try a synonym or a different word.",
      avoidCount: avoid.length,
    });
  } catch (e: any) {
    console.error("dadbot error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
