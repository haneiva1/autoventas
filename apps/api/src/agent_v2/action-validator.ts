/**
 * Agent V2 - Action Validator
 *
 * Validates proposed actions according to the validation matrix in DESIGN.md
 * Implements: state validation, quantity limits, product_id requirements
 */

import type {
  ProposedAction,
  FsmState,
  Cart,
  ValidationResult,
  ActionType,
} from './types';
import {
  ACTION_VALIDATION_RULES,
  ALLOWED_ACTIONS,
  PROHIBITED_ACTIONS,
  QUANTITY_MIN,
  QUANTITY_MAX,
} from './constants';

// =============================================================================
// Validation Context
// =============================================================================

export interface ValidationContext {
  currentState: FsmState;
  cart: Cart;
  // TODO: Add product catalog for product existence validation
  // productCatalog?: Product[];
}

// =============================================================================
// Main Validator
// =============================================================================

/**
 * Validates a single proposed action against the validation matrix
 */
export function validateAction(
  action: ProposedAction,
  context: ValidationContext
): ValidationResult {
  const { type, params } = action;

  // 1. Check if action type is prohibited
  if (isProhibitedAction(type)) {
    return {
      valid: false,
      error: `Action "${type}" is prohibited`,
      action,
    };
  }

  // 2. Check if action type is allowed
  if (!isAllowedAction(type)) {
    return {
      valid: false,
      error: `Action "${type}" is not a recognized action type`,
      action,
    };
  }

  // 3. Get validation rules for this action
  const rules = ACTION_VALIDATION_RULES[type];
  if (!rules) {
    return {
      valid: false,
      error: `No validation rules defined for action "${type}"`,
      action,
    };
  }

  // 4. Validate state is allowed for this action
  const stateError = validateState(type, context.currentState, rules.validStates);
  if (stateError) {
    return { valid: false, error: stateError, action };
  }

  // 5. Validate product_id if required
  if (rules.requiresProductId) {
    const productError = validateProductId(params?.product_id);
    if (productError) {
      return { valid: false, error: productError, action };
    }
  }

  // 6. Validate quantity if required
  if (rules.requiresQuantity) {
    const quantityError = validateQuantity(params?.quantity);
    if (quantityError) {
      return { valid: false, error: quantityError, action };
    }
  }

  // 7. Validate cart not empty if required
  if (rules.requiresCartNotEmpty) {
    const cartError = validateCartNotEmpty(context.cart);
    if (cartError) {
      return { valid: false, error: cartError, action };
    }
  }

  // 8. Validate item exists in cart if required
  if (rules.requiresItemInCart) {
    const itemError = validateItemInCart(params?.product_id, context.cart);
    if (itemError) {
      return { valid: false, error: itemError, action };
    }
  }

  // All validations passed
  return { valid: true, action };
}

/**
 * Validates multiple actions and returns results for each
 */
export function validateActions(
  actions: ProposedAction[],
  context: ValidationContext
): ValidationResult[] {
  return actions.map((action) => validateAction(action, context));
}

/**
 * Filters and returns only valid actions
 */
export function getValidActions(
  actions: ProposedAction[],
  context: ValidationContext
): { valid: ProposedAction[]; rejected: ValidationResult[] } {
  const results = validateActions(actions, context);

  const valid: ProposedAction[] = [];
  const rejected: ValidationResult[] = [];

  for (const result of results) {
    if (result.valid) {
      valid.push(result.action);
    } else {
      rejected.push(result);
    }
  }

  return { valid, rejected };
}

// =============================================================================
// Helper Validators
// =============================================================================

function isProhibitedAction(type: string): boolean {
  return (PROHIBITED_ACTIONS as readonly string[]).includes(type);
}

function isAllowedAction(type: string): type is ActionType {
  return (ALLOWED_ACTIONS as readonly string[]).includes(type);
}

function validateState(
  actionType: ActionType,
  currentState: FsmState,
  validStates: FsmState[] | 'all'
): string | null {
  if (validStates === 'all') {
    return null;
  }

  if (!validStates.includes(currentState)) {
    return `Action "${actionType}" is not allowed in state "${currentState}". Valid states: ${validStates.join(', ')}`;
  }

  return null;
}

function validateProductId(productId: string | undefined): string | null {
  if (!productId || productId.trim() === '') {
    return 'product_id is required';
  }
  // TODO: Validate product exists in catalog
  return null;
}

function validateQuantity(quantity: number | undefined): string | null {
  if (quantity === undefined || quantity === null) {
    return 'quantity is required';
  }

  if (!Number.isInteger(quantity)) {
    return `quantity must be an integer, got: ${quantity}`;
  }

  if (quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) {
    return `quantity must be between ${QUANTITY_MIN} and ${QUANTITY_MAX}, got: ${quantity}`;
  }

  return null;
}

function validateCartNotEmpty(cart: Cart): string | null {
  if (!cart.items || cart.items.length === 0) {
    return 'Cart is empty';
  }
  return null;
}

function validateItemInCart(
  productId: string | undefined,
  cart: Cart
): string | null {
  if (!productId) {
    return 'product_id is required to identify item in cart';
  }

  const itemExists = cart.items.some((item) => item.product_id === productId);
  if (!itemExists) {
    return `Item with product_id "${productId}" not found in cart`;
  }

  return null;
}
