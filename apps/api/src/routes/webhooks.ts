import type { FastifyInstance } from "fastify";
import { generateReply } from "../services/llm";

type AnyObj = Record<string, any>;

function getTextFromWebhook(body: AnyObj): { from?: string; text?: string } {
  const msg =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ??
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  const from = msg?.from as string | undefined;

  const text =
    msg?.text?.body ??
    msg?.button?.text ??
    msg?.interactive?.button_reply?.title ??
    msg?.interactive?.list_reply?.title ??
    msg?.interactive?.list_reply?.description;

  return { from, text };
}

async function sendWhatsAppText(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "Missing env vars: WHATSAPP_ACCESS_TOKEN and/or WHATSAPP_PHONE_NUMBER_ID (revisa apps/api/.env)"
    );
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Graph /messages failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// server.ts normalmente registra este archivo con prefix "/webhooks"
// => estas rutas quedan como:
// GET/POST https://api.chocolatesruah.com/webhooks/whatsapp
export async function webhookRoutes(fastify: FastifyInstance) {
  // === Meta webhook verification (GET) ===
  fastify.get("/whatsapp", async (request, reply) => {
    const q: AnyObj = (request as any).query ?? {};
    const mode = q["hub.mode"];
    const token = q["hub.verify_token"];
    const challenge = q["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).type("text/plain").send(String(challenge ?? ""));
    }
    return reply.code(403).type("text/plain").send("Forbidden");
  });

  // === Inbound messages (POST) ===
  fastify.post("/whatsapp", async (request, reply) => {
    const body: AnyObj = (request as any).body ?? {};
    const { from, text } = getTextFromWebhook(body);

    fastify.log.info({ from, text }, "WA inbound");

    // Siempre 200 para que Meta no reintente
    if (!from) return reply.code(200).send({ received: true });

    try {
      const aiReply = await generateReply(text ?? "");
    await sendWhatsAppText(from, aiReply);
    } catch (err: any) {
      fastify.log.error({ err: String(err?.message ?? err) }, "WA reply failed");
    }

    return reply.code(200).send({ received: true });
  });
}
