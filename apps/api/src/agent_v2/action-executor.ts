/**
 * Agent V2 - Action Executor
 *
 * Executes validated actions sequentially and returns the new state.
 * This module is deterministic and side-effect safe (no DB writes, no logging).
 *
 * Responsibilities:
 * - Receive validated ProposedAction[]
 * - Execute them in order
 * - Modify: cart, FSM state, human_override (if ESCALATE)
 * - Return executed actions and new state
 */

import type {
  ProposedAction,
  FsmState,
  Cart,
  CartItem,
  ConversationState,
} from './types';
import { DEFAULT_CART } from './constants';

// =============================================================================
// Input/Output Types
// =============================================================================

export interface ExecuteActionsInput {
  actions: ProposedAction[];
  current_state: ConversationState;
  product_catalog: Array<{
    id: string;
    name: string;
    price: number;
    active: boolean;
  }>;
}

export interface ExecuteActionsResult {
  executed_actions: ProposedAction[];
  new_state: ConversationState;
}

// =============================================================================
// Main Executor Function
// =============================================================================

export async function executeActions(
  input: ExecuteActionsInput
): Promise<ExecuteActionsResult> {
  const { actions, current_state, product_catalog } = input;

  // Clone state to avoid mutations
  let state = cloneState(current_state);
  const executed_actions: ProposedAction[] = [];

  // Execute each action sequentially
  for (const action of actions) {
    const result = executeSingleAction(action, state, product_catalog);
    state = result.state;
    if (result.executed) {
      executed_actions.push(action);
    }
  }

  return {
    executed_actions,
    new_state: state,
  };
}

// =============================================================================
// Single Action Executor
// =============================================================================

interface SingleActionResult {
  executed: boolean;
  state: ConversationState;
}

function executeSingleAction(
  action: ProposedAction,
  state: ConversationState,
  catalog: ExecuteActionsInput['product_catalog']
): SingleActionResult {
  switch (action.type) {
    case 'ADD_TO_CART':
      return executeAddToCart(action, state, catalog);

    case 'UPDATE_QUANTITY':
      return executeUpdateQuantity(action, state);

    case 'REMOVE_ITEM':
      return executeRemoveItem(action, state);

    case 'CLEAR_CART':
      return executeClearCart(state);

    case 'REVIEW_ORDER':
      return executeReviewOrder(state);

    case 'CONFIRM_ORDER':
      return executeConfirmOrder(state);

    case 'CANCEL_ORDER':
      return executeCancelOrder(state);

    case 'ESCALATE':
      return executeEscalate(state);

    // Actions without state effects
    case 'SHOW_CATALOG':
    case 'SHOW_PRODUCT':
    case 'REPLY':
    case 'CLARIFY':
      return { executed: true, state };

    default:
      // Unknown action type - no effect
      return { executed: false, state };
  }
}

// =============================================================================
// Cart Actions
// =============================================================================

function executeAddToCart(
  action: ProposedAction,
  state: ConversationState,
  catalog: ExecuteActionsInput['product_catalog']
): SingleActionResult {
  const { product_id, quantity } = action.params || {};
  if (!product_id || !quantity) {
    return { executed: false, state };
  }

  const product = catalog.find((p) => p.id === product_id);
  if (!product) {
    return { executed: false, state };
  }

  const cart = cloneCart(state.cart_json);
  const existingIndex = cart.items.findIndex((i) => i.product_id === product_id);

  if (existingIndex >= 0) {
    // Update existing item
    const item = cart.items[existingIndex];
    item.quantity += quantity;
    item.subtotal = item.quantity * item.unit_price;
  } else {
    // Add new item
    const newItem: CartItem = {
      product_id: product.id,
      name: product.name,
      quantity,
      unit_price: product.price,
      subtotal: quantity * product.price,
    };
    cart.items.push(newItem);
  }

  // Recalculate total
  cart.total = cart.items.reduce((sum, item) => sum + item.subtotal, 0);

  // Update FSM state: IDLE/BROWSING -> CART_OPEN
  const newFsmState = transitionOnAddToCart(state.fsm_state);

  return {
    executed: true,
    state: {
      ...state,
      cart_json: cart,
      fsm_state: newFsmState,
    },
  };
}

function executeUpdateQuantity(
  action: ProposedAction,
  state: ConversationState
): SingleActionResult {
  const { product_id, quantity } = action.params || {};
  if (!product_id || !quantity) {
    return { executed: false, state };
  }

  const cart = cloneCart(state.cart_json);
  const itemIndex = cart.items.findIndex((i) => i.product_id === product_id);

  if (itemIndex < 0) {
    return { executed: false, state };
  }

  const item = cart.items[itemIndex];
  item.quantity = quantity;
  item.subtotal = item.quantity * item.unit_price;

  // Recalculate total
  cart.total = cart.items.reduce((sum, i) => sum + i.subtotal, 0);

  return {
    executed: true,
    state: {
      ...state,
      cart_json: cart,
    },
  };
}

function executeRemoveItem(
  action: ProposedAction,
  state: ConversationState
): SingleActionResult {
  const { product_id } = action.params || {};
  if (!product_id) {
    return { executed: false, state };
  }

  const cart = cloneCart(state.cart_json);
  const itemIndex = cart.items.findIndex((i) => i.product_id === product_id);

  if (itemIndex < 0) {
    return { executed: false, state };
  }

  cart.items.splice(itemIndex, 1);

  // Recalculate total
  cart.total = cart.items.reduce((sum, i) => sum + i.subtotal, 0);

  // If cart becomes empty, transition to BROWSING
  const newFsmState = cart.items.length === 0 ? 'BROWSING' : state.fsm_state;

  return {
    executed: true,
    state: {
      ...state,
      cart_json: cart,
      fsm_state: newFsmState,
    },
  };
}

function executeClearCart(state: ConversationState): SingleActionResult {
  return {
    executed: true,
    state: {
      ...state,
      cart_json: { ...DEFAULT_CART },
      fsm_state: 'BROWSING',
    },
  };
}

// =============================================================================
// Order Actions
// =============================================================================

function executeReviewOrder(state: ConversationState): SingleActionResult {
  // REVIEW_ORDER: CART_OPEN -> CHECKOUT
  if (state.fsm_state !== 'CART_OPEN') {
    return { executed: true, state };
  }

  return {
    executed: true,
    state: {
      ...state,
      fsm_state: 'CHECKOUT',
    },
  };
}

function executeConfirmOrder(state: ConversationState): SingleActionResult {
  // CONFIRM_ORDER: CHECKOUT -> AWAITING_PAYMENT
  if (state.fsm_state !== 'CHECKOUT') {
    return { executed: true, state };
  }

  return {
    executed: true,
    state: {
      ...state,
      fsm_state: 'AWAITING_PAYMENT',
    },
  };
}

function executeCancelOrder(state: ConversationState): SingleActionResult {
  // CANCEL_ORDER: any valid state -> IDLE, clear cart
  return {
    executed: true,
    state: {
      ...state,
      cart_json: { ...DEFAULT_CART },
      fsm_state: 'IDLE',
      pending_order_id: null,
    },
  };
}

// =============================================================================
// Conversation Actions
// =============================================================================

function executeEscalate(state: ConversationState): SingleActionResult {
  // ESCALATE: any -> HUMAN_TAKEOVER, set human_override
  return {
    executed: true,
    state: {
      ...state,
      fsm_state: 'HUMAN_TAKEOVER',
      human_override: true,
      human_override_at: new Date().toISOString(),
    },
  };
}

// =============================================================================
// FSM Transition Helpers
// =============================================================================

function transitionOnAddToCart(current: FsmState): FsmState {
  switch (current) {
    case 'IDLE':
    case 'BROWSING':
      return 'CART_OPEN';
    default:
      return current;
  }
}

// =============================================================================
// State Cloning Utilities
// =============================================================================

function cloneState(state: ConversationState): ConversationState {
  return {
    ...state,
    cart_json: cloneCart(state.cart_json),
    events_log: state.events_log ? [...state.events_log] : [],
  };
}

function cloneCart(cart: Cart): Cart {
  return {
    ...cart,
    items: cart.items.map((item) => ({ ...item })),
  };
}
