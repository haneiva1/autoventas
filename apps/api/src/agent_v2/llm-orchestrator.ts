/**
 * Agent V2 - LLM Orchestrator
 *
 * Responsible for:
 * - Building the prompt for the LLM
 * - Calling the LLM (mock function)
 * - Validating that the response complies with the schema
 * - Returning validated response or safe fallback
 *
 * This module is completely pure - no side effects, no DB access, no logging.
 */

import type {
  LlmContextInput,
  LlmResponse,
  ProposedAction,
  FsmState,
} from './types';
import { ALLOWED_ACTIONS, FSM_STATES } from './constants';

// =============================================================================
// Constants
// =============================================================================

const MAX_ACTIONS = 5;
const MAX_RESPONSE_TEXT_LENGTH = 500;

const FALLBACK_RESPONSE_TEXT =
  'Disculpa, no pude procesar tu mensaje. ¿Podrías intentar de nuevo?';

// =============================================================================
// Mock LLM Function (to be replaced with real implementation)
// =============================================================================

/**
 * Mock LLM call - returns a promise that resolves to LLM response.
 * In production, this would call Gemini or another LLM.
 */
async function callLlm(_prompt: string): Promise<unknown> {
  // Mock implementation - returns empty response
  // Real implementation would call the actual LLM
  return {
    proposed_actions: [{ type: 'REPLY', params: {} }],
    response_text: 'Gracias por tu mensaje. ¿En qué puedo ayudarte?',
    suggested_state: undefined,
  };
}

// =============================================================================
// Prompt Builder
// =============================================================================

/**
 * Builds the system prompt for the LLM with instructions and constraints.
 */
function buildSystemPrompt(): string {
  return `Eres un asistente de ventas por WhatsApp. Tu trabajo es ayudar a los clientes a explorar productos, agregar items al carrito y completar pedidos.

REGLAS ESTRICTAS:
1. SIEMPRE responde SOLO en formato JSON válido
2. NUNCA incluyas texto fuera del JSON
3. Los precios son INMUTABLES - nunca los modifiques ni prometas descuentos
4. Máximo 5 acciones por respuesta
5. Solo usa acciones permitidas: ${ALLOWED_ACTIONS.join(', ')}
6. Solo usa estados válidos: ${FSM_STATES.join(', ')}

FORMATO DE RESPUESTA (OBLIGATORIO):
{
  "reasoning": "explicación breve de tu razonamiento (opcional)",
  "proposed_actions": [
    { "type": "NOMBRE_ACCION", "params": { ... } }
  ],
  "response_text": "mensaje para el cliente (máx 500 caracteres)",
  "suggested_state": "ESTADO_SUGERIDO (opcional)"
}

PARÁMETROS POR ACCIÓN:
- SHOW_CATALOG: sin params
- SHOW_PRODUCT: { "product_id": "id" }
- ADD_TO_CART: { "product_id": "id", "product_name": "nombre", "quantity": número }
- UPDATE_QUANTITY: { "product_id": "id", "quantity": número }
- REMOVE_ITEM: { "product_id": "id" }
- CLEAR_CART: sin params
- REVIEW_ORDER: sin params
- CONFIRM_ORDER: sin params
- CANCEL_ORDER: { "reason": "razón opcional" }
- REPLY: sin params
- CLARIFY: sin params
- ESCALATE: { "reason": "razón" }

NUNCA hagas estas acciones prohibidas:
- MODIFY_PRICE
- APPLY_DISCOUNT
- APPROVE_PAYMENT
- REJECT_PAYMENT
- DISABLE_OVERRIDE`;
}

/**
 * Builds the user prompt with current context.
 */
function buildUserPrompt(input: LlmContextInput): string {
  return JSON.stringify(
    {
      current_state: input.current_state,
      detected_events: input.detected_events,
      cart: input.cart,
      customer_message: input.customer_message,
      recent_history: input.recent_history,
      product_catalog: input.product_catalog,
    },
    null,
    2
  );
}

/**
 * Builds the complete prompt combining system and user prompts.
 */
function buildPrompt(input: LlmContextInput): string {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);

  return `${systemPrompt}

---

CONTEXTO ACTUAL:
${userPrompt}

Responde SOLO con JSON válido:`;
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Validates that a string is a valid FsmState.
 */
function isValidFsmState(state: unknown): state is FsmState {
  return typeof state === 'string' && FSM_STATES.includes(state as FsmState);
}

/**
 * Validates that a string is a valid ActionType.
 */
function isValidActionType(type: unknown): boolean {
  return (
    typeof type === 'string' &&
    ALLOWED_ACTIONS.includes(type as (typeof ALLOWED_ACTIONS)[number])
  );
}

/**
 * Validates action params structure.
 */
function isValidActionParams(params: unknown): boolean {
  if (params === undefined || params === null) {
    return true;
  }
  if (typeof params !== 'object') {
    return false;
  }

  const p = params as Record<string, unknown>;

  // Validate product_id if present
  if ('product_id' in p && typeof p.product_id !== 'string') {
    return false;
  }

  // Validate product_name if present
  if ('product_name' in p && typeof p.product_name !== 'string') {
    return false;
  }

  // Validate quantity if present
  if ('quantity' in p) {
    if (typeof p.quantity !== 'number' || !Number.isInteger(p.quantity)) {
      return false;
    }
    if (p.quantity < 1 || p.quantity > 100) {
      return false;
    }
  }

  // Validate reason if present
  if ('reason' in p && typeof p.reason !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validates a single proposed action.
 */
function isValidProposedAction(action: unknown): action is ProposedAction {
  if (typeof action !== 'object' || action === null) {
    return false;
  }

  const a = action as Record<string, unknown>;

  // type is required
  if (!('type' in a) || !isValidActionType(a.type)) {
    return false;
  }

  // params is optional but must be valid if present
  if (!isValidActionParams(a.params)) {
    return false;
  }

  return true;
}

/**
 * Validates the complete LLM response structure.
 */
function validateLlmResponse(response: unknown): LlmResponse | null {
  // Must be an object
  if (typeof response !== 'object' || response === null) {
    return null;
  }

  const r = response as Record<string, unknown>;

  // proposed_actions is required and must be an array
  if (!Array.isArray(r.proposed_actions)) {
    return null;
  }

  // Must have at least 1 action, max 5
  if (r.proposed_actions.length === 0 || r.proposed_actions.length > MAX_ACTIONS) {
    return null;
  }

  // All actions must be valid
  for (const action of r.proposed_actions) {
    if (!isValidProposedAction(action)) {
      return null;
    }
  }

  // response_text is required and must be a string
  if (typeof r.response_text !== 'string') {
    return null;
  }

  // response_text must not exceed max length
  if (r.response_text.length > MAX_RESPONSE_TEXT_LENGTH) {
    return null;
  }

  // suggested_state is optional but must be valid if present
  if (r.suggested_state !== undefined && !isValidFsmState(r.suggested_state)) {
    return null;
  }

  // reasoning is optional but must be a string if present
  if (r.reasoning !== undefined && typeof r.reasoning !== 'string') {
    return null;
  }

  // Build validated response
  return {
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
    proposed_actions: r.proposed_actions as ProposedAction[],
    response_text: r.response_text,
    suggested_state: r.suggested_state as FsmState | undefined,
  };
}

/**
 * Parses JSON from LLM response string.
 * Handles common issues like markdown code blocks.
 */
function parseJsonResponse(responseText: string): unknown | null {
  let text = responseText.trim();

  // Remove markdown code blocks if present
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }

  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }

  text = text.trim();

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// =============================================================================
// Fallback Builder
// =============================================================================

/**
 * Creates a safe fallback response when LLM fails or returns invalid data.
 */
function createFallbackResponse(currentState: FsmState): LlmResponse {
  return {
    proposed_actions: [],
    response_text: FALLBACK_RESPONSE_TEXT,
    suggested_state: currentState,
  };
}

// =============================================================================
// Main Orchestrator Function
// =============================================================================

/**
 * Runs the LLM orchestrator to generate a response for the given input.
 *
 * This function:
 * 1. Builds the prompt from the input context
 * 2. Calls the LLM
 * 3. Validates the response against the schema
 * 4. Returns validated response or safe fallback
 *
 * @param input - The context input for the LLM
 * @returns Promise resolving to validated LLM response
 */
export async function runLlmOrchestrator(
  input: LlmContextInput
): Promise<LlmResponse> {
  // Build the prompt
  const prompt = buildPrompt(input);

  try {
    // Call the LLM
    const rawResponse = await callLlm(prompt);

    // If response is a string, parse it as JSON
    let parsedResponse: unknown;
    if (typeof rawResponse === 'string') {
      parsedResponse = parseJsonResponse(rawResponse);
      if (parsedResponse === null) {
        // JSON parse failed
        return createFallbackResponse(input.current_state);
      }
    } else {
      parsedResponse = rawResponse;
    }

    // Validate the response structure
    const validatedResponse = validateLlmResponse(parsedResponse);

    if (validatedResponse === null) {
      // Validation failed
      return createFallbackResponse(input.current_state);
    }

    // If no suggested_state, keep current state
    if (validatedResponse.suggested_state === undefined) {
      validatedResponse.suggested_state = input.current_state;
    }

    return validatedResponse;
  } catch {
    // LLM call failed
    return createFallbackResponse(input.current_state);
  }
}

// =============================================================================
// Exports for Testing
// =============================================================================

export const __testing = {
  buildSystemPrompt,
  buildUserPrompt,
  buildPrompt,
  validateLlmResponse,
  parseJsonResponse,
  createFallbackResponse,
  isValidFsmState,
  isValidActionType,
  isValidProposedAction,
};
