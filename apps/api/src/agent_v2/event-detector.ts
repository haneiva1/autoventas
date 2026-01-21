/**
 * Agent V2 - Event Detector
 *
 * Pure function to detect conversation events from customer messages.
 * No external dependencies, no side effects, no logging, no DB access.
 */

import type { ConversationEvent } from './types';

interface DetectEventsInput {
  customer_message: string;
  has_image: boolean;
  human_override: boolean;
}

/**
 * Detects conversation events from customer input.
 *
 * Events are returned in priority order:
 * 1. ESCALATION_REQUESTED
 * 2. PAYMENT_PROOF_RECEIVED
 * 3. ORDER_CANCELLED
 * 4. GREETING_RECEIVED
 */
export function detectEvents(input: DetectEventsInput): ConversationEvent[] {
  const { customer_message, has_image, human_override } = input;

  // If human has taken over, don't detect any events
  if (human_override) {
    return [];
  }

  const events: ConversationEvent[] = [];
  const messageLower = customer_message.toLowerCase();

  // 1. ESCALATION_REQUESTED (highest priority)
  if (
    messageLower.includes('hablar con alguien') ||
    messageLower.includes('asesor') ||
    messageLower.includes('humano')
  ) {
    events.push('ESCALATION_REQUESTED');
  }

  // 2. PAYMENT_PROOF_RECEIVED
  if (
    has_image ||
    messageLower.includes('pagué') ||
    messageLower.includes('transferí')
  ) {
    events.push('PAYMENT_PROOF_RECEIVED');
  }

  // 3. ORDER_CANCELLED
  if (
    messageLower.includes('cancelar pedido') ||
    messageLower.includes('ya no quiero')
  ) {
    events.push('ORDER_CANCELLED');
  }

  // 4. GREETING_RECEIVED (lowest priority)
  if (
    messageLower.includes('hola') ||
    messageLower.includes('buenos días') ||
    messageLower.includes('buenas tardes')
  ) {
    events.push('GREETING_RECEIVED');
  }

  return events;
}
