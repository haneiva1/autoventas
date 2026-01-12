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

export async function generateAIReply(params: AIReplyParams): Promise<string> {
  const { customerName, messageBody, conversationHistory, products, log } = params;

  if (!messageBody) {
    return 'Recibimos tu mensaje. ¿En qué podemos ayudarte?';
  }

  // If no API key, return a mock response for development
  if (!genAI) {
    log.warn('GEMINI_API_KEY not set, using mock AI response');
    return `¡Hola${customerName ? ` ${customerName}` : ''}! Gracias por tu mensaje. Estamos procesando tu consulta. Un representante te contactará pronto.`;
  }

  // Build context
  const productList = products
    .map((p) => `- ${p.name}: Bs ${p.price}${p.description ? ` (${p.description})` : ''}`)
    .join('\n');

  const historyText = conversationHistory
    .reverse()
    .slice(-10) // Last 10 messages for context
    .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Asistente'}: ${m.body || ''}`)
    .join('\n');

  const systemPrompt = `Eres un asistente de ventas amable y profesional para AutoVentas.
Tu trabajo es ayudar a los clientes a conocer productos, realizar pedidos y resolver dudas.

REGLAS:
- Responde siempre en español
- Sé conciso pero cordial (máximo 2-3 oraciones)
- Si preguntan por productos, menciona los disponibles con precios
- Si quieren comprar, pregunta cantidad y método de entrega (pickup o delivery)
- Si mencionan pago, indica que pueden enviar comprobante de transferencia
- NO inventes productos que no están en el catálogo

CATÁLOGO DE PRODUCTOS:
${productList || 'No hay productos configurados'}

HISTORIAL DE CONVERSACIÓN:
${historyText || 'Nueva conversación'}`;

  const userPrompt = `El cliente ${customerName || ''} dice: "${messageBody}"

Genera una respuesta apropiada.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
      ],
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.7,
      },
    });

    const response = result.response.text();
    log.debug({ response }, 'AI response generated');

    return response.trim();
  } catch (error) {
    log.error({ error }, 'Gemini API error');
    throw error;
  }
}
