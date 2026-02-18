import type { CommerceDecision } from "./commerce-decisions.js";

/**
 * Cerebro determinista y testeable.
 * - NO usa WhatsApp/Fastify/Supabase.
 * - NO llama LLM.
 * - Devuelve una decisión única y ejecutable.
 */
export function commerceBrain(input: { text: string }): CommerceDecision {
  const raw = (input.text || "").trim();
  const t = raw.toLowerCase();

  // 1) Saludo → abrir venta
  if (
    t === "hola" || t === "buenas" || t === "holaa" ||
    t.startsWith("hola ") || t.startsWith("buenas ")
  ) {
    return {
      type: "SEND_TEXT",
      text:
        "¡Hola! Soy el asistente de Chocolates Ruah 🍫\n\n" +
        "Puedo ayudarte a:\n" +
        "1) Ver el catálogo\n" +
        "2) Armar tu pedido\n\n" +
        "Decime: *catálogo* o contame qué te gustaría (sabor/cantidad).",
    };
  }

  // 2) Catálogo (mínimo, luego conectamos catálogo real)
  if (t.includes("catalog") || t.includes("catálogo") || t === "catalogo" || t === "catálogo") {
    return {
      type: "SEND_TEXT",
      text:
        "Catálogo (rápido):\n\n" +
        "🍫 Chocolate clásico\n" +
        "🍫 Chocolate relleno\n" +
        "🍫 Chocolate premium\n\n" +
        "Decime cuál querés y cuántos.",
    };
  }

  // 3) Fallback duro (contrato)
  return { type: "NO_OP" };
}
