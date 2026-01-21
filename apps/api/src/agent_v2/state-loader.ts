/**
 * Agent V2 - State Loader
 *
 * Handles all database persistence for conversation state.
 * Reads state from Supabase, creates initial state if not exists.
 * Never uses local memory - all state comes from database.
 */

import type { ConversationState, Cart, FsmState, Product, ProposedAction } from './types';
import { supabaseAdmin } from '../lib/supabase.js';

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

export interface ActionHistoryRecord {
  conversation_id: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  validated: boolean;
  executed: boolean;
  fsm_state_before: string;
  fsm_state_after: string;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_CART: Cart = {
  items: [],
  total: 0,
  currency: 'BOB',
};

const DEFAULT_CONVERSATION_STATE: ConversationState = {
  fsm_state: 'IDLE' as FsmState,
  human_override: false,
  human_override_at: null,
  cart_json: DEFAULT_CART,
  pending_order_id: null,
  events_log: [],
  last_llm_response: null,
};

// =============================================================================
// Main State Loader
// =============================================================================

/**
 * Loads conversation state from database.
 * Creates initial state if it doesn't exist.
 */
export async function loadConversationState(
  params: StateLoaderParams
): Promise<ConversationState> {
  const { conversation_id } = params;

  const { data, error } = await supabaseAdmin
    .from('conversation_state')
    .select('fsm_state, human_override, human_override_at, cart_json, pending_order_id, last_llm_response')
    .eq('conversation_id', conversation_id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load conversation state: ${error.message}`);
  }

  // If no state exists, create initial state
  if (!data) {
    await createInitialState(params);
    return { ...DEFAULT_CONVERSATION_STATE };
  }

  return {
    fsm_state: (data.fsm_state as FsmState) || 'IDLE',
    human_override: data.human_override || false,
    human_override_at: data.human_override_at || null,
    cart_json: (data.cart_json as Cart) || DEFAULT_CART,
    pending_order_id: data.pending_order_id || null,
    events_log: [],
    last_llm_response: data.last_llm_response || null,
  };
}

/**
 * Creates initial conversation state in database.
 */
async function createInitialState(params: StateLoaderParams): Promise<void> {
  const { conversation_id } = params;

  const { error } = await supabaseAdmin
    .from('conversation_state')
    .upsert({
      conversation_id,
      fsm_state: 'IDLE',
      human_override: false,
      human_override_at: null,
      cart_json: DEFAULT_CART,
      pending_order_id: null,
      last_llm_response: null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'conversation_id',
    });

  if (error) {
    throw new Error(`Failed to create initial state: ${error.message}`);
  }
}

/**
 * Saves conversation state to database.
 */
export async function saveConversationState(
  params: StateLoaderParams,
  state: Partial<ConversationState>
): Promise<void> {
  const { conversation_id } = params;

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (state.fsm_state !== undefined) {
    updateData.fsm_state = state.fsm_state;
  }
  if (state.human_override !== undefined) {
    updateData.human_override = state.human_override;
  }
  if (state.human_override_at !== undefined) {
    updateData.human_override_at = state.human_override_at;
  }
  if (state.cart_json !== undefined) {
    updateData.cart_json = state.cart_json;
  }
  if (state.pending_order_id !== undefined) {
    updateData.pending_order_id = state.pending_order_id;
  }
  if (state.last_llm_response !== undefined) {
    updateData.last_llm_response = state.last_llm_response;
  }

  const { error } = await supabaseAdmin
    .from('conversation_state')
    .update(updateData)
    .eq('conversation_id', conversation_id);

  if (error) {
    throw new Error(`Failed to save conversation state: ${error.message}`);
  }
}

/**
 * Loads product catalog from database.
 */
export async function loadProductCatalog(tenant_id: string): Promise<Product[]> {
  const { data, error } = await supabaseAdmin
    .from('vendi_products')
    .select('id, name, price, is_active')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to load product catalog: ${error.message}`);
  }

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    active: p.is_active,
  }));
}

/**
 * Loads recent message history for context.
 */
export async function loadRecentHistory(
  conversation_id: string,
  limit: number = 10
): Promise<Array<{ role: 'customer' | 'assistant'; text: string }>> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('direction, body')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent history: ${error.message}`);
  }

  return (data || [])
    .reverse()
    .map((m) => ({
      role: m.direction === 'inbound' ? 'customer' as const : 'assistant' as const,
      text: m.body || '',
    }));
}

/**
 * Loads all state needed for processing a message.
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
 * Updates human_override flag.
 */
export async function setHumanOverride(
  params: StateLoaderParams,
  enabled: boolean
): Promise<void> {
  await saveConversationState(params, {
    human_override: enabled,
    human_override_at: enabled ? new Date().toISOString() : null,
  });
}

/**
 * Updates FSM state.
 */
export async function updateFsmState(
  params: StateLoaderParams,
  newState: FsmState
): Promise<void> {
  await saveConversationState(params, {
    fsm_state: newState,
  });
}

/**
 * Updates cart.
 */
export async function updateCart(
  params: StateLoaderParams,
  cart: Cart
): Promise<void> {
  await saveConversationState(params, {
    cart_json: cart,
  });
}

/**
 * Inserts a record into action_history.
 */
export async function insertActionHistory(
  record: ActionHistoryRecord
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('action_history')
    .insert({
      conversation_id: record.conversation_id,
      action_type: record.action_type,
      action_payload: record.action_payload,
      validated: record.validated,
      executed: record.executed,
      fsm_state_before: record.fsm_state_before,
      fsm_state_after: record.fsm_state_after,
    });

  if (error) {
    throw new Error(`Failed to insert action history: ${error.message}`);
  }
}

/**
 * Inserts multiple action history records in batch.
 */
export async function insertActionHistoryBatch(
  records: ActionHistoryRecord[]
): Promise<void> {
  if (records.length === 0) return;

  const { error } = await supabaseAdmin
    .from('action_history')
    .insert(records.map((r) => ({
      conversation_id: r.conversation_id,
      action_type: r.action_type,
      action_payload: r.action_payload,
      validated: r.validated,
      executed: r.executed,
      fsm_state_before: r.fsm_state_before,
      fsm_state_after: r.fsm_state_after,
    })));

  if (error) {
    throw new Error(`Failed to insert action history batch: ${error.message}`);
  }
}
