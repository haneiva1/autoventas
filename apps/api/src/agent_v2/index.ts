/**
 * Agent V2 - Main Entry Point
 *
 * Exports the processMessage function for handling incoming WhatsApp messages
 * with the new deterministic validation flow.
 */

import type {
  ProcessMessageInput,
  ProcessMessageResult,
  FsmState,
} from './types';
import { loadConversationState } from './state-loader';

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

// =============================================================================
// Main Process Message Function
// =============================================================================

/**
 * Processes an incoming WhatsApp message using Agent V2 logic
 *
 * Current implementation (skeleton):
 * 1. Loads conversation state (stub)
 * 2. If human_override is true → returns { handled: true, response_text: null } (silence)
 * 3. Otherwise → returns { handled: false } (let V1 handle it)
 *
 * @param input - The incoming message input
 * @returns ProcessMessageResult indicating how the message was handled
 */
export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { conversation_id, customer_message, wa_phone, tenant_id } = input;

  console.log(`[agent_v2] processMessage called:`, {
    conversation_id,
    wa_phone,
    tenant_id,
    message_preview: customer_message.substring(0, 50),
  });

  try {
    // Step 1: Load conversation state (currently a stub)
    const state = await loadConversationState({
      conversation_id,
      tenant_id,
    });

    console.log(`[agent_v2] Loaded state:`, {
      fsm_state: state.fsm_state,
      human_override: state.human_override,
      cart_items: state.cart_json.items.length,
    });

    // Step 2: Check human_override - if true, agent stays silent
    if (state.human_override) {
      console.log(
        `[agent_v2] human_override=true, returning silence (handled=true, response_text=null)`
      );
      return {
        handled: true,
        response_text: null, // null means no response (silence)
        new_state: state.fsm_state,
      };
    }

    // Step 3: For now, return handled=false to let V1 handle it
    // TODO: Implement full Agent V2 flow:
    // - Detect events
    // - Build LLM context
    // - Call LLM
    // - Validate proposed actions
    // - Execute valid actions
    // - Return response
    console.log(
      `[agent_v2] No special handling yet, returning handled=false (V1 will handle)`
    );

    return {
      handled: false,
      response_text: null,
    };
  } catch (error) {
    console.error(`[agent_v2] Error processing message:`, error);

    // On error, return handled=false so V1 can try
    return {
      handled: false,
      response_text: null,
      validation_errors: [
        error instanceof Error ? error.message : 'Unknown error',
      ],
    };
  }
}

/**
 * Checks if Agent V2 is enabled via feature flag
 * TODO: Implement actual env var check
 */
export function isAgentV2Enabled(): boolean {
  // TODO: Read from process.env.AGENT_V2_ENABLED
  return false;
}
