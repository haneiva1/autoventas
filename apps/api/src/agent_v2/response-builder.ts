/**
 * Agent V2 - Response Builder
 *
 * Builds the final ProcessMessageResult from pipeline output.
 * Pure function - no business logic, no side effects.
 */

import type {
  ProcessMessageResult,
  FsmState,
  ProposedAction,
} from './types';

// =============================================================================
// Input Type
// =============================================================================

export interface BuildResponseInput {
  human_override: boolean;
  response_text: string | null;
  new_state: FsmState;
  executed_actions: ProposedAction[];
  validation_errors: string[];
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Builds the final ProcessMessageResult from pipeline output.
 *
 * Rules:
 * - If human_override === true → handled: true, response_text: null (silence)
 * - If response_text exists → handled: true
 * - If nothing to say → handled: false
 */
export function buildResponse(input: BuildResponseInput): ProcessMessageResult {
  const {
    human_override,
    response_text,
    new_state,
    executed_actions,
    validation_errors,
  } = input;

  // Rule 1: Human override → silence (handled but no response)
  if (human_override) {
    return {
      handled: true,
      response_text: null,
      new_state,
      executed_actions,
      validation_errors: validation_errors.length > 0 ? validation_errors : undefined,
    };
  }

  // Rule 2: Has response text → handled
  if (response_text && response_text.trim().length > 0) {
    return {
      handled: true,
      response_text,
      new_state,
      executed_actions,
      validation_errors: validation_errors.length > 0 ? validation_errors : undefined,
    };
  }

  // Rule 3: Nothing to say → not handled
  return {
    handled: false,
    response_text: null,
    new_state,
    executed_actions,
    validation_errors: validation_errors.length > 0 ? validation_errors : undefined,
  };
}
