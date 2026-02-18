/**
 * CONTRATO DE DECISIONES DE COMERCIO
 *
 * Define QUÉ puede decidir el agente.
 * NO contiene lógica.
 * NO conoce WhatsApp, Fastify ni Supabase.
 * Es la fuente de verdad del comportamiento permitido.
 */

export type CommerceDecision =
  | SendTextDecision
  | SendQrDecision
  | HandoffFallbackDecision
  | NoOpDecision;

export type DecisionType =
  | "SEND_TEXT"
  | "SEND_QR"
  | "HANDOFF_FALLBACK"
  | "NO_OP";

/**
 * Enviar un mensaje de texto al cliente.
 * El texto debe venir FINAL, listo para enviar.
 */
export interface SendTextDecision {
  type: "SEND_TEXT";
  text: string;
}

/**
 * Enviar el QR de pago.
 * El executor se encarga de cómo enviarlo.
 */
export interface SendQrDecision {
  type: "SEND_QR";
  qrUrl: string;      // normalmente "/pay/qr"
  text?: string;      // texto opcional de acompañamiento
}

/**
 * Fallback obligatorio cuando el agente no sabe qué hacer
 * o la solicitud está fuera de alcance.
 *
 * ⚠️ El executor debe enviar EXACTAMENTE FALLBACK_TEXT
 * y NO intentar nada más.
 */
export interface HandoffFallbackDecision {
  type: "HANDOFF_FALLBACK";
  reason?: string;    // solo para logs internos
}

/**
 * No hacer nada (útil para deduplicación o mensajes vacíos).
 */
export interface NoOpDecision {
  type: "NO_OP";
  reason?: string;    // solo para logs internos
}

/**
 * MENSAJE ÚNICO DE FALLBACK (FUENTE DE VERDAD)
 */
export const FALLBACK_TEXT =
  "No puedo ayudarte con esta solicitud.\n" +
  "Por favor, contactate con el equipo de Ruah al +591 78888262.\n" +
  "¡Gracias!";
