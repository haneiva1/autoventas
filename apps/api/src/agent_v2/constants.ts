/**
 * Agent V2 - Constants
 *
 * All constants including FSM states, actions, and validation matrix
 */

import type { FsmState, ActionType, ActionValidationRule } from './types';

// =============================================================================
// FSM States
// =============================================================================

export const FSM_STATES: readonly FsmState[] = [
  'IDLE',
  'BROWSING',
  'CART_OPEN',
  'CHECKOUT',
  'AWAITING_PAYMENT',
  'COMPLETED',
  'HUMAN_TAKEOVER',
] as const;

// =============================================================================
// Allowed Actions
// =============================================================================

export const ALLOWED_ACTIONS: readonly ActionType[] = [
  // Catalog
  'SHOW_CATALOG',
  'SHOW_PRODUCT',
  // Cart
  'ADD_TO_CART',
  'UPDATE_QUANTITY',
  'REMOVE_ITEM',
  'CLEAR_CART',
  // Order
  'REVIEW_ORDER',
  'CONFIRM_ORDER',
  'CANCEL_ORDER',
  // Conversation
  'REPLY',
  'CLARIFY',
  'ESCALATE',
] as const;

// =============================================================================
// Prohibited Actions (always rejected)
// =============================================================================

export const PROHIBITED_ACTIONS = [
  'MODIFY_PRICE',
  'APPLY_DISCOUNT',
  'APPROVE_PAYMENT',
  'REJECT_PAYMENT',
  'DISABLE_OVERRIDE',
] as const;

// =============================================================================
// Validation Matrix (from DESIGN.md section 8)
// =============================================================================

export const ACTION_VALIDATION_RULES: Record<ActionType, ActionValidationRule> = {
  // Catalog actions - allowed in all states
  SHOW_CATALOG: {
    validStates: 'all',
  },
  SHOW_PRODUCT: {
    validStates: 'all',
    requiresProductId: true,
  },

  // Cart actions
  ADD_TO_CART: {
    validStates: ['IDLE', 'BROWSING', 'CART_OPEN'],
    requiresProductId: true,
    requiresQuantity: true,
  },
  UPDATE_QUANTITY: {
    validStates: ['CART_OPEN'],
    requiresProductId: true, // to identify item in cart
    requiresQuantity: true,
    requiresItemInCart: true,
  },
  REMOVE_ITEM: {
    validStates: ['CART_OPEN'],
    requiresProductId: true,
    requiresItemInCart: true,
  },
  CLEAR_CART: {
    validStates: ['CART_OPEN'],
    requiresCartNotEmpty: true,
  },

  // Order actions
  REVIEW_ORDER: {
    validStates: ['CART_OPEN'],
    requiresCartNotEmpty: true,
  },
  CONFIRM_ORDER: {
    validStates: ['CHECKOUT'],
    requiresCartNotEmpty: true,
  },
  CANCEL_ORDER: {
    validStates: ['CART_OPEN', 'CHECKOUT', 'AWAITING_PAYMENT'],
  },

  // Conversation actions - allowed in all states
  REPLY: {
    validStates: 'all',
  },
  CLARIFY: {
    validStates: 'all',
  },
  ESCALATE: {
    validStates: 'all',
    // Note: ESCALATE activates human_override automatically
  },
};

// =============================================================================
// Quantity Limits
// =============================================================================

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 100;

// =============================================================================
// Feature Flag
// =============================================================================

export const AGENT_V2_FEATURE_FLAG = 'AGENT_V2_ENABLED';

// =============================================================================
// Default Cart
// =============================================================================

export const DEFAULT_CART = {
  items: [],
  total: 0,
  currency: 'BOB',
} as const;

// =============================================================================
// Default Conversation State
// =============================================================================

export const DEFAULT_CONVERSATION_STATE = {
  fsm_state: 'IDLE' as FsmState,
  human_override: false,
  human_override_at: null,
  cart_json: DEFAULT_CART,
  pending_order_id: null,
  events_log: [],
  last_llm_response: null,
} as const;
