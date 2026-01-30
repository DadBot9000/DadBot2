import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // This makes the problem obvious in the response instead of crashing.
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const client = new OpenAI({ apiKey });

    const { query } = req.body ?? {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing query" });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.8,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "You are DadBot9000. Return ONE short dad joke about the user's topic. No extra text.",
        },
        { role: "user", content: query.trim() },
      ],
    });

    const joke = completion.choices[0]?.message?.content?.trim() ?? "";
    return res.status(200).json({ joke });
  } catch (e: any) {
    console.error("dadbot error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
