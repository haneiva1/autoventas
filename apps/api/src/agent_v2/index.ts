/**
 * Agent V2 - Main Entry Point
 *
 * Exports the processMessage function for handling incoming WhatsApp messages
 * with the new deterministic validation flow.
 *
 * Pipeline:
 * 1. Load state
 * 2. Detect events
 * 3. Check human_override
 * 4. Run LLM orchestrator
 * 5. Validate actions
 * 6. Execute actions
 * 7. Build response
 *
 * No side effects: no DB writes, no WhatsApp sends, no logging.
 */

import type {
  ProcessMessageInput,
  ProcessMessageResult,
  FsmState,
  LlmContextInput,
} from './types';
import { loadFullState, loadRecentHistory } from './state-loader';
import { detectEvents } from './event-detector';
import { runLlmOrchestrator } from './llm-orchestrator';
import { getValidActions } from './action-validator';
import { executeActions } from './action-executor';
import { buildResponse } from './response-builder';

// Re-export types for consumers
export type {
  ProcessMessageInput,
  ProcessMessageResult,
  FsmState,
  ConversationState,
  Cart,
  CartItem,
  ProposedAction,
  ActionType,
  ValidationResult,
} from './types';

// Re-export validator functions
export {
  validateAction,
  validateActions,
  getValidActions,
} from './action-validator';

// Re-export constants
export {
  FSM_STATES,
  ALLOWED_ACTIONS,
  PROHIBITED_ACTIONS,
  ACTION_VALIDATION_RULES,
  QUANTITY_MIN,
  QUANTITY_MAX,
  DEFAULT_CART,
  DEFAULT_CONVERSATION_STATE,
  AGENT_V2_FEATURE_FLAG,
} from './constants';

// Re-export state loader functions
export {
  loadConversationState,
  saveConversationState,
  loadProductCatalog,
  loadRecentHistory,
  loadFullState,
  setHumanOverride,
  updateFsmState,
  updateCart,
} from './state-loader';

// Re-export event detector
export { detectEvents } from './event-detector';

// Re-export LLM orchestrator
export { runLlmOrchestrator } from './llm-orchestrator';

// Re-export action executor
export { executeActions } from './action-executor';

// Re-export response builder
export { buildResponse } from './response-builder';

// =============================================================================
// Main Process Message Function
// =============================================================================

/**
 * Processes an incoming WhatsApp message using Agent V2 logic.
 *
 * Pipeline:
 * 1. Load conversation state and product catalog
 * 2. Detect events from customer message
 * 3. If human_override → return silence (handled=true, response_text=null)
 * 4. Build LLM context and run orchestrator
 * 5. Validate proposed actions
 * 6. Execute valid actions
 * 7. Build and return response
 *
 * No side effects: state changes are returned, not persisted.
 *
 * @param input - The incoming message input
 * @returns ProcessMessageResult with response and state changes
 */
export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { conversation_id, customer_message, tenant_id } = input;

  // Step 1: Load conversation state and product catalog
  const { conversationState, products } = await loadFullState({
    conversation_id,
    tenant_id,
  });

  // Step 2: Detect events from customer message
  const detectedEvents = detectEvents({
    customer_message,
    has_image: false, // TODO: Pass from input when available
    human_override: conversationState.human_override,
  });

  // Step 3: If human_override is active, return silence
  if (conversationState.human_override) {
    return buildResponse({
      human_override: true,
      response_text: null,
      new_state: conversationState.fsm_state,
      executed_actions: [],
      validation_errors: [],
    });
  }

  // Step 4: Load recent history and build LLM context
  const recentHistory = await loadRecentHistory(conversation_id);

  const llmContext: LlmContextInput = {
    current_state: conversationState.fsm_state,
    detected_events: detectedEvents,
    cart: conversationState.cart_json,
    customer_message,
    recent_history: recentHistory,
    product_catalog: products,
  };

  // Step 5: Run LLM orchestrator
  const llmResponse = await runLlmOrchestrator(llmContext);

  // Step 6: Validate proposed actions
  const { valid: validActions, rejected } = getValidActions(
    llmResponse.proposed_actions,
    {
      currentState: conversationState.fsm_state,
      cart: conversationState.cart_json,
    }
  );

  // Collect validation errors
  const validationErrors = rejected.map((r) => r.error).filter((e): e is string => !!e);

  // Step 7: Execute valid actions
  const executionResult = await executeActions({
    actions: validActions,
    current_state: conversationState,
    product_catalog: products,
  });

  // Determine final state (prefer action execution result, fall back to LLM suggestion)
  const finalState = executionResult.new_state.fsm_state;

  // Step 8: Build and return response
  return buildResponse({
    human_override: executionResult.new_state.human_override,
    response_text: llmResponse.response_text,
    new_state: finalState,
    executed_actions: executionResult.executed_actions,
    validation_errors,
  });
}

/**
 * Checks if Agent V2 is enabled via feature flag.
 */
export function isAgentV2Enabled(): boolean {
  return process.env.AGENT_V2_ENABLED === 'true';
}
