import { supabaseAdmin } from '../lib/supabase'

export type ConversationState = {
  waId: string
  step: 'START' | 'BROWSING' | 'BUILDING_CART' | 'READY_TO_CONFIRM' | 'AWAITING_PAYMENT'
  hasSeenCatalog: boolean
  cart: Array<{
    productId: string
    name: string
    qty: number
    price: number
  }>
  totalAmount: number
  deliveryMethod: 'DELIVERY' | 'PICKUP' | null
}

const initialState = (waId: string): ConversationState => ({
  waId,
  step: 'START',
  hasSeenCatalog: false,
  cart: [],
  totalAmount: 0,
  deliveryMethod: null,
})

export async function loadConversationState(waId: string): Promise<ConversationState> {
  const { data, error } = await supabaseAdmin
    .from('conversation_state')
    .select('*')
    .eq('wa_id', waId)
    .single()

  if (data) {
    return {
      waId: data.wa_id,
      step: data.step,
      hasSeenCatalog: data.has_seen_catalog,
      cart: data.cart,
      totalAmount: Number(data.total_amount),
      deliveryMethod: data.delivery_method,
    }
  }

  // PGRST116 = no rows found (Supabase PostgREST)
  if (error && (error as any).code !== 'PGRST116') {
    throw error
  }

  const state = initialState(waId)

  await supabaseAdmin.from('conversation_state').insert({
    wa_id: state.waId,
    step: state.step,
    has_seen_catalog: state.hasSeenCatalog,
    cart: state.cart,
    total_amount: state.totalAmount,
    delivery_method: state.deliveryMethod,
  })

  return state
}

export async function saveConversationState(state: ConversationState): Promise<void> {
  await supabaseAdmin
    .from('conversation_state')
    .upsert({
      wa_id: state.waId,
      step: state.step,
      has_seen_catalog: state.hasSeenCatalog,
      cart: state.cart,
      total_amount: state.totalAmount,
      delivery_method: state.deliveryMethod,
      updated_at: new Date().toISOString(),
    })
}
