import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });

    const { query, avoidJokes } = req.body ?? {};
    if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });

    const avoid: string[] = Array.isArray(avoidJokes)
      ? avoidJokes.filter((x: any) => typeof x === "string").slice(0, 50)
      : [];

    const avoidSet = new Set(avoid.map(norm));
    const client = new OpenAI({ apiKey });

    for (let attempt = 0; attempt < 4; attempt++) {
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 1.0,
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content:
              "You are DadBot9000. Return ONE short dad joke about the user's topic. " +
              "It MUST NOT match or closely rephrase any joke in the avoid list. " +
              "No explanations. No extra text.",
          },
          {
            role: "user",
            content:
              `Topic: ${query.trim()}\n` +
              (avoid.length ? `Avoid list:\n- ${avoid.join("\n- ")}\n` : "") +
              "Return a NEW joke now.",
          },
        ],
      });

      const joke = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!joke) continue;

      if (!avoidSet.has(norm(joke))) {
        return res.status(200).json({ joke, avoidCount: avoid.length });
      }
    }

    return res.status(409).json({ error: "Could not generate a unique joke. Try another word." });
  } catch (e: any) {
    console.error("dadbot error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
