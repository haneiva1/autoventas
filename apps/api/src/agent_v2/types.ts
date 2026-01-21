/**
 * Agent V2 - Type Definitions
 *
 * All types for the Agent V2 system based on DESIGN.md
 */

// =============================================================================
// FSM States (7 estados)
// =============================================================================

export type FsmState =
  | 'IDLE'
  | 'BROWSING'
  | 'CART_OPEN'
  | 'CHECKOUT'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED'
  | 'HUMAN_TAKEOVER';

// =============================================================================
// Events (no son estados)
// =============================================================================

export type ConversationEvent =
  | 'GREETING_RECEIVED'
  | 'PAYMENT_PROOF_RECEIVED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'ESCALATION_REQUESTED'
  | 'SESSION_TIMEOUT'
  | 'ORDER_CANCELLED';

// =============================================================================
// Actions
// =============================================================================

export type ActionType =
  // Catalog
  | 'SHOW_CATALOG'
  | 'SHOW_PRODUCT'
  // Cart
  | 'ADD_TO_CART'
  | 'UPDATE_QUANTITY'
  | 'REMOVE_ITEM'
  | 'CLEAR_CART'
  // Order
  | 'REVIEW_ORDER'
  | 'CONFIRM_ORDER'
  | 'CANCEL_ORDER'
  // Conversation
  | 'REPLY'
  | 'CLARIFY'
  | 'ESCALATE';

// Prohibited actions (never allowed)
export type ProhibitedAction =
  | 'MODIFY_PRICE'
  | 'APPLY_DISCOUNT'
  | 'APPROVE_PAYMENT'
  | 'REJECT_PAYMENT'
  | 'DISABLE_OVERRIDE';

// =============================================================================
// Action Parameters
// =============================================================================

export interface ActionParams {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  reason?: string;
}

export interface ProposedAction {
  type: ActionType;
  params?: ActionParams;
}

// =============================================================================
// Cart Types
// =============================================================================

export interface CartItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  currency: string;
}

// =============================================================================
// Product Types
// =============================================================================

export interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

// =============================================================================
// Conversation State (from database)
// =============================================================================

export interface ConversationState {
  fsm_state: FsmState;
  human_override: boolean;
  human_override_at?: string | null;
  cart_json: Cart;
  pending_order_id?: string | null;
  events_log?: unknown[];
  last_llm_response?: LlmResponse | null;
}

// =============================================================================
// LLM Contract Types
// =============================================================================

export interface LlmContextInput {
  current_state: FsmState;
  detected_events: ConversationEvent[];
  cart: Cart;
  customer_message: string;
  recent_history: Array<{
    role: 'customer' | 'assistant';
    text: string;
  }>;
  product_catalog: Product[];
}

export interface LlmResponse {
  reasoning?: string;
  proposed_actions: ProposedAction[];
  response_text: string;
  suggested_state?: FsmState;
}

// =============================================================================
// Validation Types
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  action: ProposedAction;
}

export interface ActionValidationRule {
  validStates: FsmState[] | 'all';
  requiresProductId?: boolean;
  requiresQuantity?: boolean;
  requiresCartNotEmpty?: boolean;
  requiresItemInCart?: boolean;
}

// =============================================================================
// Process Message Types
// =============================================================================

export interface ProcessMessageInput {
  conversation_id: string;
  customer_message: string;
  wa_phone: string;
  tenant_id: string;
}

export interface ProcessMessageResult {
  handled: boolean;
  response_text: string | null;
  new_state?: FsmState;
  executed_actions?: ProposedAction[];
  validation_errors?: string[];
}
