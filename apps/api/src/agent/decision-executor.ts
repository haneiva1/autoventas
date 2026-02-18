import {
  CommerceDecision,
  FALLBACK_TEXT,
} from "./commerce-decisions.js";

/**
 * executeDecision
 *
 * Traduce una decisión de comercio en acciones reales.
 * NO decide.
 * NO conoce Fastify ni Supabase.
 */
export async function executeDecision(
  decision: CommerceDecision,
  context: {
    sendText: (text: string) => Promise<void>;
    sendQr: (qrUrl: string, text?: string) => Promise<void>;
  }
): Promise<void> {
  switch (decision.type) {
    case "SEND_TEXT": {
      await context.sendText(decision.text);
      return;
    }

    case "SEND_QR": {
      await context.sendQr(decision.qrUrl, decision.text);
      return;
    }

    case "HANDOFF_FALLBACK": {
      await context.sendText(FALLBACK_TEXT);
      return;
    }

    case "NO_OP": {
      // Intencionalmente no hacer nada
      return;
    }

    default: {
      // Safety net (no debería ocurrir)
      await context.sendText(FALLBACK_TEXT);
      return;
    }
  }
}
