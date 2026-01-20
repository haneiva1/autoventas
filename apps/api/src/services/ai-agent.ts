import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../lib/config.js';
import type { AppLogger } from '../lib/types.js';

// Only initialize if API key is available
const genAI = config.GEMINI_API_KEY
  ? new GoogleGenerativeAI(config.GEMINI_API_KEY)
  : null;

interface AIReplyParams {
  customerName: string | null;
  messageBody: string | null;
  conversationHistory: Array<{ direction: string; body: string | null }>;
  products: Array<{ name: string; price: number; description: string | null }>;
  log: AppLogger;
}

// Payment keywords to detect payment-related messages
const PAYMENT_KEYWORDS = [
  'pago', 'pagar', 'transferencia', 'deposito', 'depósito',
  'banco', 'qr', 'cuenta', 'comprobante', 'pagué', 'pague'
];

// Objection keywords
const OBJECTION_KEYWORDS = [
  'caro', 'mucho', 'descuento', 'rebaja', 'precio', 'barato',
  'después', 'despues', 'luego', 'mañana', 'pensarlo', 'no sé', 'no se'
];

// Detect conversation phase based on history
function detectConversationPhase(
  messageBody: string,
  history: Array<{ direction: string; body: string | null }>
): 'greeting' | 'interest' | 'objection' | 'ready_to_buy' | 'payment' {
  const msgLower = messageBody.toLowerCase();

  // Check for payment intent
  if (PAYMENT_KEYWORDS.some(kw => msgLower.includes(kw))) {
    return 'payment';
  }

  // Check for objections
  if (OBJECTION_KEYWORDS.some(kw => msgLower.includes(kw))) {
    return 'objection';
  }

  // Check for purchase intent
  if (/quiero|necesito|dame|mand[aá]|quier[oa]|llevo|comprar|pedir/.test(msgLower)) {
    return 'ready_to_buy';
  }

  // Check for product interest
  if (/cuánto|cuanto|precio|tienen|hay|disponible|producto/.test(msgLower)) {
    return 'interest';
  }

  // New conversation or greeting
  if (history.length <= 2 || /hola|buenas|buenos|hi|saludos/.test(msgLower)) {
    return 'greeting';
  }

  return 'interest';
}

export async function generateAIReply(params: AIReplyParams): Promise<string> {
  const { customerName, messageBody, conversationHistory, products, log } = params;

  if (!messageBody) {
    return '¿Qué producto te interesa hoy?';
  }

  const phase = detectConversationPhase(messageBody, conversationHistory);
  log.debug({ phase, messageBody }, 'Detected conversation phase');

  // If no API key, return phase-appropriate mock responses
  if (!genAI) {
    log.warn('GEMINI_API_KEY not set, using mock AI response');
    return getMockResponse(phase, customerName, products);
  }

  // Build compact product list
  const productList = products
    .map((p) => `${p.name}: Bs ${p.price}`)
    .join(' | ');

  // Keep only last 6 messages for faster context
  const historyText = conversationHistory
    .slice(-6)
    .map((m) => `${m.direction === 'in' ? 'C' : 'V'}: ${m.body || ''}`)
    .join('\n');

  const systemPrompt = `Eres vendedor de AutoVentas. OBJETIVO: cerrar ventas rápido.

REGLAS ESTRICTAS:
1. Máximo 2 oraciones por respuesta
2. Siempre termina con pregunta que lleve al pago
3. No expliques, no des rodeos. Directo al punto
4. Ante objeciones: valida breve + oferta/urgencia
5. Si ya eligió producto → pide pago inmediato
6. Tono: amable pero directo (Bolivia)

FASES DE VENTA:
- GREETING: Saluda + pregunta qué busca
- INTEREST: Menciona precio + pregunta cantidad
- OBJECTION: Maneja breve + redirige a compra
- READY_TO_BUY: Confirma total + da datos de pago
- PAYMENT: Da instrucciones claras de transferencia

DATOS DE PAGO:
Banco: BNB
Cuenta: 1234567890
Nombre: AutoVentas SRL
"Envíame foto del comprobante para confirmar tu pedido"

PRODUCTOS: ${productList || 'Consultar disponibilidad'}

HISTORIAL:
${historyText || 'Nuevo'}

FASE ACTUAL: ${phase.toUpperCase()}`;

  const userPrompt = `Cliente${customerName ? ` (${customerName})` : ''}: "${messageBody}"`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
      ],
      generationConfig: {
        maxOutputTokens: 100, // Shorter responses
        temperature: 0.5, // More consistent
      },
    });

    const response = result.response.text();
    log.debug({ response, phase }, 'AI response generated');

    return response.trim();
  } catch (error) {
    log.error({ error }, 'Gemini API error');
    // Fallback to mock on error
    return getMockResponse(phase, customerName, products);
  }
}

// Mock responses by conversation phase
function getMockResponse(
  phase: string,
  customerName: string | null,
  products: Array<{ name: string; price: number; description: string | null }>
): string {
  const name = customerName ? ` ${customerName}` : '';
  const topProduct = products[0];

  switch (phase) {
    case 'greeting':
      return `¡Hola${name}! ¿Qué producto te interesa hoy?`;

    case 'interest':
      if (topProduct) {
        return `Tenemos ${topProduct.name} a Bs ${topProduct.price}. ¿Cuántos necesitas?`;
      }
      return `¿Qué cantidad necesitas?`;

    case 'objection':
      return `Entiendo${name}. Este precio es el mejor del mercado. ¿Te confirmo el pedido?`;

    case 'ready_to_buy':
      return `Perfecto${name}. Transferí a cuenta BNB 1234567890 (AutoVentas SRL) y mandame el comprobante.`;

    case 'payment':
      return `Banco BNB, cuenta 1234567890, a nombre de AutoVentas SRL. Envíame foto del comprobante para confirmar.`;

    default:
      return `¿En qué te puedo ayudar${name}?`;
  }
}
