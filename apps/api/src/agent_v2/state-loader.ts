/**
 * Agent V2 - State Loader
 *
 * STUB IMPLEMENTATION - Returns default values for now
 * TODO: Implement actual database queries for conversation_state
 */

import type { ConversationState, Cart, FsmState, Product } from './types';
import { DEFAULT_CART, DEFAULT_CONVERSATION_STATE } from './constants';

// =============================================================================
// State Loader Interface
// =============================================================================

export interface StateLoaderParams {
  conversation_id: string;
  tenant_id: string;
}

export interface LoadedState {
  conversationState: ConversationState;
  products: Product[];
}

// =============================================================================
// Main State Loader (STUB)
// =============================================================================

/**
 * Loads conversation state from database
 * STUB: Returns default values for now
 */
export async function loadConversationState(
  params: StateLoaderParams
): Promise<ConversationState> {
  // TODO: Implement actual Supabase query
  // const { conversation_id, tenant_id } = params;
  // const { data, error } = await supabase
  //   .from('conversation_state')
  //   .select('*')
  //   .eq('conversation_id', conversation_id)
  //   .single();

  console.log(
    `[agent_v2/state-loader] STUB: loadConversationState called for conversation_id=${params.conversation_id}`
  );

  return {
    fsm_state: 'IDLE' as FsmState,
    human_override: false,
    human_override_at: null,
    cart_json: {
      items: [],
      total: 0,
      currency: 'BOB',
    },
    pending_order_id: null,
    events_log: [],
    last_llm_response: null,
  };
}

/**
 * Saves conversation state to database
 * STUB: Does nothing for now
 */
export async function saveConversationState(
  params: StateLoaderParams,
  state: Partial<ConversationState>
): Promise<void> {
  // TODO: Implement actual Supabase upsert
  // const { conversation_id, tenant_id } = params;
  // const { error } = await supabase
  //   .from('conversation_state')
  //   .upsert({
  //     conversation_id,
  //     tenant_id,
  //     ...state,
  //     updated_at: new Date().toISOString(),
  //   });

  console.log(
    `[agent_v2/state-loader] STUB: saveConversationState called for conversation_id=${params.conversation_id}`,
    state
  );
}

/**
 * Loads product catalog from database
 * STUB: Returns empty array for now
 */
export async function loadProductCatalog(tenant_id: string): Promise<Product[]> {
  // TODO: Implement actual Supabase query
  // const { data, error } = await supabase
  //   .from('vendi_products')
  //   .select('id, name, price, active')
  //   .eq('tenant_id', tenant_id)
  //   .eq('active', true);

  console.log(
    `[agent_v2/state-loader] STUB: loadProductCatalog called for tenant_id=${tenant_id}`
  );

  return [];
}

/**
 * Loads recent message history for context
 * STUB: Returns empty array for now
 */
export async function loadRecentHistory(
  conversation_id: string,
  limit: number = 10
): Promise<Array<{ role: 'customer' | 'assistant'; text: string }>> {
  // TODO: Implement actual Supabase query
  // const { data, error } = await supabase
  //   .from('messages')
  //   .select('direction, body')
  //   .eq('conversation_id', conversation_id)
  //   .order('created_at', { ascending: false })
  //   .limit(limit);

  console.log(
    `[agent_v2/state-loader] STUB: loadRecentHistory called for conversation_id=${conversation_id}, limit=${limit}`
  );

  return [];
}

/**
 * Loads all state needed for processing a message
 * STUB: Returns defaults for now
 */
export async function loadFullState(
  params: StateLoaderParams
): Promise<LoadedState> {
  const [conversationState, products] = await Promise.all([
    loadConversationState(params),
    loadProductCatalog(params.tenant_id),
  ]);

  return {
    conversationState,
    products,
  };
}

/**
 * Updates human_override flag
 * STUB: Does nothing for now
 */
export async function setHumanOverride(
  params: StateLoaderParams,
  enabled: boolean
): Promise<void> {
  // TODO: Implement actual Supabase update
  // const { error } = await supabase
  //   .from('conversation_state')
  //   .update({
  //     human_override: enabled,
  //     human_override_at: enabled ? new Date().toISOString() : null,
  //   })
  //   .eq('conversation_id', params.conversation_id);

  console.log(
    `[agent_v2/state-loader] STUB: setHumanOverride called: ${enabled} for conversation_id=${params.conversation_id}`
  );
}

/**
 * Updates FSM state
 * STUB: Does nothing for now
 */
export async function updateFsmState(
  params: StateLoaderParams,
  newState: FsmState
): Promise<void> {
  // TODO: Implement actual Supabase update
  console.log(
    `[agent_v2/state-loader] STUB: updateFsmState called: ${newState} for conversation_id=${params.conversation_id}`
  );
}

/**
 * Updates cart
 * STUB: Does nothing for now
 */
export async function updateCart(
  params: StateLoaderParams,
  cart: Cart
): Promise<void> {
  // TODO: Implement actual Supabase update
  console.log(
    `[agent_v2/state-loader] STUB: updateCart called for conversation_id=${params.conversation_id}`,
    cart
  );
}
