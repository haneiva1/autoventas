
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

export async function generateReply(input: string): Promise<string> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: input }]
          }
        ]
      })
    }
  );

  const data = await res.json();

return (
  (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text ??
  "No pude responder en este momento."
);
}
