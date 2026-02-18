import { commerceBrain } from "./commerce-brain.js";
import type { CommerceDecision } from "./commerce-decisions.js";

/**
 * Decide qué hacer a nivel comercio.
 * Por ahora: determinista puro.
 * (Luego: podemos sumar LLM como sugeridor, pero sin romper el contrato.)
 */
export async function decideCommerce(input: { messageText: string }): Promise<CommerceDecision> {
  return commerceBrain({ text: input.messageText });
}
