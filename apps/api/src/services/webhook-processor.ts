import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { WhatsAppWebhook, WhatsAppMessage, WhatsAppContact } from '../schemas/whatsapp.js';
import { storeOutboundMessage } from './message-store.js';
import type { AppLogger } from '../lib/types.js';
import { parseProductOrder, addToCart, calcCartTotal } from './product-parser.js';

// Catálogo hardcodeado
const CATALOG: Record<string, { name: string; price: number }> = {
  '1': { name: 'Chocolate Clásico', price: 30 },
  '2': { name: 'Chocolate Premium', price: 45 },
};

// State types
type ConversationState = 'IDLE' | 'BUILDING_ORDER' | 'AWAITING_PAYMENT';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export async function processWebhookEvent(
  payload: WhatsAppWebhook,
  log: AppLogger
): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      // Skip if no messages (could be status update)
      if (!value.messages || value.messages.length === 0) {
        log.debug('No messages in webhook event, skipping');
        continue;
      }

      for (const message of value.messages) {
        const contact = value.contacts?.[0];
        const dedupeKey = `wa:${message.id}`;

        // Check for duplicate
        const { data: existingEvent } = await supabaseAdmin
          .from('webhook_events')
          .select('id')
          .eq('dedupe_key', dedupeKey)
          .single();

        if (existingEvent) {
          log.debug({ messageId: message.id }, 'Duplicate webhook event, skipping');
          continue;
        }

        // Store raw webhook event
        const { error: eventError } = await supabaseAdmin
          .from('webhook_events')
          .insert({
            tenant_id: config.TENANT_ID,
            source: 'whatsapp',
            event_type: 'message',
            dedupe_key: dedupeKey,
            payload: payload,
            received_at: new Date().toISOString(),
          });

        if (eventError) {
          log.error({ error: eventError }, 'Failed to store webhook event');
          continue;
        }

        // Process the message
        await processMessage(message, contact, log);
      }
    }
  }
}

export async function processMessage(
  message: WhatsAppMessage,
  contact: WhatsAppContact | undefined,
  log: AppLogger
): Promise<{ conversationId: string | null; orderId: string | null; paymentId: string | null }> {
  const waPhone = message.from;
  const contactName = contact?.profile?.name || null;

  // 1. Upsert contact
  const { data: dbContact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .upsert(
      {
        tenant_id: config.TENANT_ID,
        wa_phone: waPhone,
        name: contactName,
        tags: [],
        metadata: {},
      },
      {
        onConflict: 'tenant_id,wa_phone',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (contactError || !dbContact) {
    log.error({ error: contactError }, 'Failed to upsert contact');
    return { conversationId: null, orderId: null, paymentId: null };
  }

  // 2. Find or create conversation
  let conversation = await findActiveConversation(dbContact.id, log);
  if (!conversation) {
    conversation = await createConversation(dbContact.id, log);
  }

  if (!conversation) {
    log.error('Failed to get or create conversation');
    return { conversationId: null, orderId: null, paymentId: null };
  }

  // 3. Extract and store inbound message
  const messageBody = extractMessageBody(message);

  const { data: storedMessage, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: config.TENANT_ID,
      conversation_id: conversation.id,
      direction: 'in',
      message_type: message.type,
      body: messageBody,
      wa_message_id: message.id,
      raw: message,
    })
    .select()
    .single();

  if (messageError) {
    log.error({ error: messageError }, 'Failed to store message');
    return { conversationId: conversation.id, orderId: null, paymentId: null };
  }

  log.info({ messageId: storedMessage.id, type: message.type }, 'Message stored');

  // 4. Update last_message_at
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 5. Get or create conversation state
  const { data: stateRow } = await supabaseAdmin
  .from('conversation_state')
  .select('*')
  .eq('tenant_id', config.TENANT_ID)
  .eq('wa_from', waPhone)
  .single();

  let currentState: ConversationState = (stateRow?.current_state as ConversationState) || 'IDLE';
  let cart: CartItem[] = stateRow?.cart || [];
  let total: number = stateRow?.total_amount || 0;

  const text = (messageBody || '').trim().toLowerCase();
  let reply = '';
  let orderId: string | null = null;

  await supabaseAdmin
    .from('conversation_state')
    .upsert({
      tenant_id: config.TENANT_ID,
      wa_from: waPhone,
      current_state: currentState,
      cart,
      total_amount: total
    }, { onConflict: 'tenant_id,wa_from' });


  // 6. State machine logic

  // SALUDO - resets to BUILDING_ORDER
  if (/hola|buenas|buenos/.test(text)) {
    currentState = 'BUILDING_ORDER';
    cart = [];
    total = 0;
    reply = `¡Hola! 🍫 Bienvenido a Chocolates Ruah.

Nuestro catálogo:
1. Chocolate Clásico - Bs 30
2. Chocolate Premium - Bs 45

Escribe "1 x2" para pedir 2 Clásicos.
Cuando termines, escribe PAGAR.`;
  }
  // BUILDING_ORDER - add items or PAGAR
else if (currentState === 'BUILDING_ORDER') {

  const { data: products } = await supabaseAdmin
    .from('vendi_products')
    .select('id, name, price, currency')
    .eq('tenant_id', config.TENANT_ID)
    .eq('is_active', true);

  const parsed = parseProductOrder(text, products || []);

  if (parsed) {
    cart = addToCart(cart, parsed);
    total = calcCartTotal(cart);

    const cartSummary = cart.map(i => `${i.name} x${i.quantity}`).join('\n');

    reply = `✅ Agregado.

Tu carrito:
${cartSummary}

Total: Bs ${total}

Escribe PAGAR para continuar o agrega más productos.`;

  } else if (text === 'pagar') {

    if (cart.length === 0) {
      reply = 'Tu carrito está vacío.';
    } else {
      currentState = 'AWAITING_PAYMENT';
      reply = `Total a pagar: Bs ${total}

Escanea el QR:
https://api.chocolatesruah.com/pay/qr

Cuando pagues, escribe: Ya pagué ${total}`;
    }

  } else {
    reply = 'No entendí el producto. Escribe el nombre del chocolate.';
  }
}
  else if (currentState === 'AWAITING_PAYMENT') {
    if (/ya pague|ya pagué|pague/.test(text)) {
      // Create order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          tenant_id: config.TENANT_ID,
          customer_phone: waPhone,
          customer_name: contactName,
          status: 'PAYMENT_PENDING',
          products_json: cart,
          total_amount: total,
          currency: 'BOB',
          delivery_method: 'PICKUP',
          source: 'whatsapp',
        })
        .select('id')
        .single();

      if (orderError) {
        log.error({ error: orderError }, 'Failed to create order');
        reply = 'Hubo un error al crear tu pedido. Intenta de nuevo.';
      } else {
        orderId = orderData.id;
        currentState = 'IDLE';
        cart = [];
        total = 0;
        reply = 'Gracias 🙌 Estamos verificando tu pago.';
        log.info({ orderId }, 'Order created with PAYMENT_PENDING');
      }
    } else {
      reply = 'Estamos esperando tu pago. Escribe "ya pagué" cuando termines.';
    }
  }
  // IDLE or default
  else {
    reply = 'No entendí tu mensaje. Escribe "hola" para comenzar.';
  }

  // 7. Save state
  await supabaseAdmin.from('conversation_state').upsert(
    {
      tenant_id: config.TENANT_ID,
      wa_from: waPhone,
      current_state: currentState,
      cart: cart,
      total_amount: total,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,wa_from' }
  );

  // 8. Store outbound message
  await storeOutboundMessage({
    conversationId: conversation.id,
    body: reply,
    log,
  });

  return { conversationId: conversation.id, orderId, paymentId: null };
}

function extractMessageBody(message: WhatsAppMessage): string | null {
  switch (message.type) {
    case 'text':
      return message.text?.body || null;
    case 'image':
      return message.image?.caption || '[Imagen recibida]';
    default:
      return `[${message.type}]`;
  }
}

async function findActiveConversation(
  contactId: string,
  log: AppLogger
): Promise<{ id: string } | null> {
  // Find conversation from last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('tenant_id', config.TENANT_ID)
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found
    log.error({ error }, 'Error finding conversation');
  }

  return data;
}

async function createConversation(
  contactId: string,
  log: AppLogger
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: config.TENANT_ID,
      contact_id: contactId,
      status: 'active',
      channel: 'whatsapp',
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    log.error({ error }, 'Failed to create conversation');
    return null;
  }

  return data;
}

