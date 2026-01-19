import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../lib/config.js';

// ============================================================================
// WhatsApp Webhook Schema
// ============================================================================

const TextMessageSchema = z.object({
  body: z.string(),
});

const MessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: TextMessageSchema.optional(),
});

const ContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
});

const MetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

const ValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: MetadataSchema,
  contacts: z.array(ContactSchema).optional(),
  messages: z.array(MessageSchema).optional(),
  statuses: z.array(z.any()).optional(),
});

const ChangeSchema = z.object({
  value: ValueSchema,
  field: z.literal('messages'),
});

const EntrySchema = z.object({
  id: z.string(),
  changes: z.array(ChangeSchema),
});

const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(EntrySchema),
});

// ============================================================================
// Product Catalog
// ============================================================================

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

const PRODUCT_CATALOG: Product[] = [
  { id: '1', name: 'Camiseta Básica', price: 15000, description: 'Camiseta 100% algodón' },
  { id: '2', name: 'Pantalón Jean', price: 45000, description: 'Jean clásico azul' },
  { id: '3', name: 'Zapatillas Running', price: 85000, description: 'Zapatillas deportivas' },
  { id: '4', name: 'Gorra Deportiva', price: 12000, description: 'Gorra ajustable' },
];

// ============================================================================
// In-Memory State Management
// ============================================================================

type ConversationState = 'initial' | 'catalog_shown' | 'awaiting_order' | 'order_created';

interface CustomerState {
  state: ConversationState;
  customerName: string | null;
  lastActivity: number;
  currentOrder: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  } | null;
}

const customerStates = new Map<string, CustomerState>();

function getCustomerState(phone: string): CustomerState {
  let state = customerStates.get(phone);

  // Reset state if older than 30 minutes
  if (state && Date.now() - state.lastActivity > 30 * 60 * 1000) {
    state = undefined;
  }

  if (!state) {
    state = {
      state: 'initial',
      customerName: null,
      lastActivity: Date.now(),
      currentOrder: null,
    };
    customerStates.set(phone, state);
  }

  state.lastActivity = Date.now();
  return state;
}

// ============================================================================
// WhatsApp Cloud API - Send Message
// ============================================================================

async function sendWhatsAppMessage(to: string, text: string, log: any): Promise<boolean> {
  const accessToken = config.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    log.warn('WhatsApp credentials not configured, logging message instead');
    log.info({ to, text }, 'OUTBOUND MESSAGE (not sent - no credentials)');
    return false;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, 'Failed to send WhatsApp message');
      return false;
    }

    const result = await response.json() as { messages?: Array<{ id: string }> };
    log.info({ to, messageId: result.messages?.[0]?.id }, 'WhatsApp message sent');
    return true;
  } catch (error) {
    log.error({ error }, 'Error sending WhatsApp message');
    return false;
  }
}

// ============================================================================
// Sales Flow Logic
// ============================================================================

function formatCatalog(): string {
  let catalog = '🛍️ *Nuestro Catálogo*\n\n';

  for (const product of PRODUCT_CATALOG) {
    catalog += `*${product.id}. ${product.name}*\n`;
    catalog += `   ${product.description}\n`;
    catalog += `   💰 $${product.price.toLocaleString('es-CO')}\n\n`;
  }

  catalog += '---\n';
  catalog += 'Para ordenar, envía el *número del producto* y la *cantidad*.\n';
  catalog += 'Ejemplo: *1 2* (2 camisetas básicas)';

  return catalog;
}

function formatOrderSummary(order: NonNullable<CustomerState['currentOrder']>): string {
  return `✅ *Pedido Creado*

📦 Producto: ${order.productName}
📊 Cantidad: ${order.quantity}
💵 Precio unitario: $${order.unitPrice.toLocaleString('es-CO')}
💰 *Total: $${order.total.toLocaleString('es-CO')}*

---
*Instrucciones de Pago:*

Transferir a:
🏦 Banco: Bancolombia
📝 Cuenta: 123-456789-00
👤 Titular: Tienda Demo S.A.S
🔢 NIT: 900.123.456-7

Una vez realices el pago, envía el comprobante por este chat.

¡Gracias por tu compra! 🙏`;
}

function parseOrderInput(text: string): { productId: string; quantity: number } | null {
  // Match patterns like "1 2", "1, 2", "producto 1 cantidad 2", etc.
  const simpleMatch = text.match(/^(\d+)\s*[,\s]\s*(\d+)$/);
  if (simpleMatch) {
    return { productId: simpleMatch[1], quantity: parseInt(simpleMatch[2], 10) };
  }

  // Match "quiero 2 camisetas" or similar
  const quantityFirst = text.match(/(\d+)\s+(?:de\s+)?(?:producto\s+)?(\d+)/i);
  if (quantityFirst) {
    return { productId: quantityFirst[2], quantity: parseInt(quantityFirst[1], 10) };
  }

  // Match just a product number (assume quantity 1)
  const singleMatch = text.match(/^(\d+)$/);
  if (singleMatch) {
    return { productId: singleMatch[1], quantity: 1 };
  }

  return null;
}

async function processMessage(
  phone: string,
  messageText: string,
  contactName: string | null,
  log: any
): Promise<void> {
  const state = getCustomerState(phone);

  if (contactName && !state.customerName) {
    state.customerName = contactName;
  }

  const text = messageText.trim().toLowerCase();
  log.info({ phone, state: state.state, text }, 'Processing message');

  // Handle greeting or first message
  if (state.state === 'initial') {
    const greeting = state.customerName
      ? `¡Hola ${state.customerName}! 👋 Bienvenido a nuestra tienda.`
      : '¡Hola! 👋 Bienvenido a nuestra tienda.';

    await sendWhatsAppMessage(phone, greeting, log);
    await sendWhatsAppMessage(phone, formatCatalog(), log);

    state.state = 'catalog_shown';
    return;
  }

  // Handle catalog request at any point
  if (text.includes('catalogo') || text.includes('catálogo') || text.includes('productos') || text.includes('menu') || text.includes('menú')) {
    await sendWhatsAppMessage(phone, formatCatalog(), log);
    state.state = 'catalog_shown';
    return;
  }

  // Handle order creation
  if (state.state === 'catalog_shown' || state.state === 'awaiting_order') {
    const orderInput = parseOrderInput(messageText.trim());

    if (orderInput) {
      const product = PRODUCT_CATALOG.find(p => p.id === orderInput.productId);

      if (!product) {
        await sendWhatsAppMessage(
          phone,
          `❌ Producto no encontrado. Por favor, elige un número del 1 al ${PRODUCT_CATALOG.length}.`,
          log
        );
        return;
      }

      if (orderInput.quantity < 1 || orderInput.quantity > 99) {
        await sendWhatsAppMessage(
          phone,
          '❌ La cantidad debe ser entre 1 y 99.',
          log
        );
        return;
      }

      // Create order
      state.currentOrder = {
        productId: product.id,
        productName: product.name,
        quantity: orderInput.quantity,
        unitPrice: product.price,
        total: product.price * orderInput.quantity,
      };
      state.state = 'order_created';

      log.info({ phone, order: state.currentOrder }, 'Order created');

      await sendWhatsAppMessage(phone, formatOrderSummary(state.currentOrder), log);
      return;
    }

    // Couldn't parse order
    await sendWhatsAppMessage(
      phone,
      '🤔 No entendí tu pedido.\n\nPor favor envía el número del producto y la cantidad.\nEjemplo: *1 2* (2 camisetas)',
      log
    );
    state.state = 'awaiting_order';
    return;
  }

  // Handle post-order messages (assume payment confirmation)
  if (state.state === 'order_created') {
    await sendWhatsAppMessage(
      phone,
      '📩 Recibimos tu mensaje. Nuestro equipo verificará tu pago pronto.\n\n¿Deseas ver el catálogo nuevamente? Escribe *catálogo*.',
      log
    );
    return;
  }

  // Fallback
  await sendWhatsAppMessage(
    phone,
    '¿En qué te puedo ayudar? Escribe *catálogo* para ver nuestros productos.',
    log
  );
}

// ============================================================================
// Fastify Routes
// ============================================================================

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /webhooks/whatsapp - Meta verification
  fastify.get('/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = config.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      request.log.error('WHATSAPP_VERIFY_TOKEN not configured');
      return reply.status(500).type('text/plain').send('Server misconfigured');
    }

    if (mode === 'subscribe' && token === verifyToken) {
      request.log.info('WhatsApp webhook verified successfully');
      return reply.status(200).type('text/plain').send(challenge);
    }

    request.log.warn({ mode, tokenMatch: token === verifyToken }, 'Webhook verification failed');
    return reply.status(403).type('text/plain').send('Forbidden');
  });

  // POST /webhooks/whatsapp - Incoming events
  fastify.post('/whatsapp', async (request, reply) => {
    const startTime = Date.now();

    const parseResult = WhatsAppWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn({ errors: parseResult.error.issues }, 'Invalid webhook payload');
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const payload = parseResult.data;

    // Process messages
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        // Skip if no messages (could be status update)
        if (!value.messages || value.messages.length === 0) {
          request.log.debug('No messages in webhook event, skipping');
          continue;
        }

        for (const message of value.messages) {
          // Only process text messages
          if (message.type !== 'text' || !message.text?.body) {
            request.log.debug({ type: message.type }, 'Skipping non-text message');
            continue;
          }

          const phone = message.from;
          const text = message.text.body;
          const contactName = value.contacts?.[0]?.profile?.name || null;

          // Process asynchronously to not block webhook response
          setImmediate(async () => {
            try {
              await processMessage(phone, text, contactName, request.log);
            } catch (error) {
              request.log.error({ error, phone }, 'Failed to process message');
            }
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    request.log.info({ duration }, 'Webhook received');

    return reply.status(200).send({ received: true });
  });
};
