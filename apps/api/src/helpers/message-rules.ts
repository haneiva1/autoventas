/**
 * Orquestador de reglas de negocio para mensajes
 * Procesa mensajes con reglas determinísticas antes de usar LLM
 */

import { inferQuantity, isQuantityMessage } from './quantity.js';
import { detectFlavor, isFlavorSelection } from './flavor-detector.js';
import { calculateTotal, generateOrderSummary, formatPrice, getPrice, AVAILABLE_FLAVORS } from './pricing.js';
import {
  getContext,
  setFlavor,
  setQuantityAndTotal,
  confirmOrder,
  resetContext,
  type ConversationState,
} from './conversation-context.js';

// Resultado del procesamiento de reglas
export interface RuleResult {
  handled: boolean;      // ¿Se manejó con reglas?
  reply: string | null;  // Respuesta a enviar (si handled=true)
  newState: ConversationState | null; // Nuevo estado (para logging)
}

// No manejado - pasar al LLM
const NOT_HANDLED: RuleResult = {
  handled: false,
  reply: null,
  newState: null,
};

/**
 * Procesa un mensaje aplicando reglas de negocio
 * Si retorna handled=true, NO llamar al LLM
 *
 * @param phone - Número de teléfono del cliente
 * @param text - Texto del mensaje
 * @param contactName - Nombre del contacto (opcional)
 * @returns RuleResult indicando si se manejó y qué responder
 */
export function processWithRules(
  phone: string,
  text: string,
  contactName: string | null
): RuleResult {
  const context = getContext(phone);
  const state = context.state;

  // ============================================
  // ESTADO: awaiting_quantity
  // El usuario ya eligió sabor, esperamos cantidad
  // ============================================
  if (state === 'awaiting_quantity' && context.flavor) {
    const quantity = inferQuantity(text);

    if (quantity !== null) {
      const total = calculateTotal(context.flavor, quantity);

      if (total !== null) {
        // Actualizar contexto
        setQuantityAndTotal(phone, quantity, total);

        // Generar respuesta de confirmación
        const orderSummary = generateOrderSummary(context.flavor, quantity);
        const flavorDisplay = context.flavor.charAt(0).toUpperCase() + context.flavor.slice(1);

        const reply =
          `Perfecto! ${quantity} ${quantity === 1 ? 'tableta' : 'tabletas'} de ${flavorDisplay} ` +
          `a ${formatPrice(getPrice(context.flavor)!)} c/u = *${formatPrice(total)}* total.\n\n` +
          `¿Confirmas tu pedido? Responde "sí" para continuar.`;

        return {
          handled: true,
          reply,
          newState: 'awaiting_confirmation',
        };
      }
    }

    // Si no detectamos cantidad clara, podemos dar una pista
    if (isQuantityMessage(text)) {
      // El usuario intentó dar cantidad pero no la entendimos
      return {
        handled: true,
        reply: 'No entendí la cantidad. ¿Cuántas tabletas necesitas? (ej: 2, 3, cinco)',
        newState: state,
      };
    }

    // El mensaje no parece ser cantidad, podría ser cambio de sabor
    const newFlavor = detectFlavor(text);
    if (newFlavor) {
      setFlavor(phone, newFlavor);
      const price = getPrice(newFlavor);
      const flavorDisplay = newFlavor.charAt(0).toUpperCase() + newFlavor.slice(1);

      return {
        handled: true,
        reply: `Cambiamos a ${flavorDisplay} (${formatPrice(price!)}). ¿Cuántas tabletas quieres?`,
        newState: 'awaiting_quantity',
      };
    }

    // No entendimos, pedir cantidad de nuevo
    return {
      handled: true,
      reply: `¿Cuántas tabletas de ${context.flavor} necesitas?`,
      newState: state,
    };
  }

  // ============================================
  // ESTADO: awaiting_confirmation
  // Esperamos "sí" o similar para confirmar
  // ============================================
  if (state === 'awaiting_confirmation' && context.flavor && context.total) {
    const normalized = text.toLowerCase().trim();

    // Detectar confirmación
    const confirmPatterns = /^(s[ií]|si|sip|ok|dale|listo|confirmo|confirmado|va|claro|por supuesto)$/i;
    if (confirmPatterns.test(normalized) || /\bs[ií]\b/.test(normalized)) {
      confirmOrder(phone);

      const reply =
        `¡Pedido confirmado! 🎉\n\n` +
        `*Tu pedido:*\n` +
        `${context.quantity} ${context.quantity === 1 ? 'tableta' : 'tabletas'} de ${context.flavor}\n` +
        `Total: *${formatPrice(context.total)}*\n\n` +
        `*Datos para transferencia:*\n` +
        `Banco: BNB\n` +
        `Cuenta: 1234567890\n` +
        `Nombre: AutoVentas SRL\n\n` +
        `Envíame foto del comprobante cuando hagas el pago.`;

      return {
        handled: true,
        reply,
        newState: 'awaiting_payment',
      };
    }

    // Detectar cancelación/negación
    const cancelPatterns = /^(no|nop|cancela|cancelar|mejor no|luego|despues)$/i;
    if (cancelPatterns.test(normalized)) {
      resetContext(phone);

      return {
        handled: true,
        reply: 'Sin problema. Si cambias de opinión, aquí estoy. ¿Te interesa otro sabor?',
        newState: 'idle',
      };
    }

    // Cambio de cantidad
    const newQuantity = inferQuantity(text);
    if (newQuantity !== null) {
      const newTotal = calculateTotal(context.flavor, newQuantity);
      if (newTotal !== null) {
        setQuantityAndTotal(phone, newQuantity, newTotal);
        const flavorDisplay = context.flavor.charAt(0).toUpperCase() + context.flavor.slice(1);

        return {
          handled: true,
          reply:
            `Actualizado: ${newQuantity} ${newQuantity === 1 ? 'tableta' : 'tabletas'} de ${flavorDisplay} ` +
            `= *${formatPrice(newTotal)}* total.\n\n¿Confirmas?`,
          newState: 'awaiting_confirmation',
        };
      }
    }

    // No entendimos, repetir pregunta
    return {
      handled: true,
      reply: `Tu pedido es ${formatPrice(context.total)}. ¿Confirmas? (responde "sí" o "no")`,
      newState: state,
    };
  }

  // ============================================
  // ESTADO: idle o awaiting_flavor
  // Detectar selección de sabor
  // ============================================
  if (state === 'idle' || state === 'awaiting_flavor') {
    const flavor = detectFlavor(text);

    if (flavor && isFlavorSelection(text)) {
      setFlavor(phone, flavor);
      const price = getPrice(flavor);
      const flavorDisplay = flavor.charAt(0).toUpperCase() + flavor.slice(1);

      return {
        handled: true,
        reply: `Excelente elección! ${flavorDisplay} a ${formatPrice(price!)} cada tableta. ¿Cuántas quieres?`,
        newState: 'awaiting_quantity',
      };
    }

    // Si hay una cantidad pero no sabor, podría ser que quiera algo
    // pero no especificó qué. Dejar que el LLM maneje.
  }

  // ============================================
  // ESTADO: awaiting_payment
  // El usuario debería enviar comprobante (imagen)
  // Esto usualmente se maneja aparte, pero podemos dar info
  // ============================================
  if (state === 'awaiting_payment') {
    const normalized = text.toLowerCase();

    // Si pregunta por datos de pago otra vez
    if (/banco|cuenta|transferir|datos|pago|como pago/.test(normalized)) {
      return {
        handled: true,
        reply:
          `*Datos para transferencia:*\n` +
          `Banco: BNB\n` +
          `Cuenta: 1234567890\n` +
          `Nombre: AutoVentas SRL\n\n` +
          `Total a pagar: *${formatPrice(context.total!)}*\n\n` +
          `Envíame foto del comprobante.`,
        newState: state,
      };
    }

    // Si parece que ya pagó o envió algo
    if (/ya pague|comprobante|transferi|pague|envie|mande/.test(normalized)) {
      return {
        handled: true,
        reply: 'Recibido. Verificaré tu pago y te confirmo enseguida. Gracias!',
        newState: state,
      };
    }
  }

  // ============================================
  // No se aplicó ninguna regla
  // ============================================
  return NOT_HANDLED;
}

/**
 * Genera una lista de sabores disponibles formateada
 */
export function getFlavorListMessage(): string {
  const lines = AVAILABLE_FLAVORS.map(f => {
    const price = getPrice(f);
    const display = f.charAt(0).toUpperCase() + f.slice(1);
    return `• ${display}: ${formatPrice(price!)}`;
  });

  return `*Sabores disponibles:*\n${lines.join('\n')}`;
}
