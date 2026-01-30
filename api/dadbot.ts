import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const { query, previousJoke } = req.body ?? {};

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing query" });
    }

    const prev =
      typeof previousJoke === "string" ? previousJoke.trim() : "";

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.9, // 🔥 higher = more variation
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "You are DadBot9000. Return ONE short dad joke about the user's topic. " +
            "If a previous joke is provided, the new joke MUST be different. " +
            "No explanations. No extra text.",
        },
        {
          role: "user",
          content:
            `Topic: ${query.trim()}\n` +
            (prev
              ? `Previous joke (do NOT repeat or rephrase): ${prev}\n`
              : "") +
            "Return a NEW joke now.",
        },
      ],
    });

    const joke =
      completion.choices[0]?.message?.content?.trim() ?? "";

    return res.status(200).json({ joke });
  } catch (e: any) {
    console.error("dadbot error:", e);
    return res.status(500).json({
      error: e?.message ?? "Server error",
    });
  }
}
