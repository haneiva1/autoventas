/**
 * Manejo de contexto de conversación en memoria
 * Almacena el estado de cada conversación por número de teléfono
 */

import type { FlavorName } from './pricing.js';

// Estados posibles de la conversación
export type ConversationState =
  | 'idle'              // Sin interacción activa
  | 'awaiting_flavor'   // Esperando que elija sabor
  | 'awaiting_quantity' // Sabor elegido, esperando cantidad
  | 'awaiting_confirmation' // Cantidad calculada, esperando confirmación
  | 'awaiting_payment'  // Confirmado, esperando pago
  | 'completed';        // Pedido completado

// Contexto de una conversación
export interface ConversationContext {
  state: ConversationState;
  flavor: FlavorName | null;
  quantity: number | null;
  total: number | null;
  customerName: string | null;
  lastUpdated: number; // timestamp
}

// Almacén en memoria (Map por número de teléfono)
const conversationStore = new Map<string, ConversationContext>();

// TTL para limpiar contextos antiguos (30 minutos)
const CONTEXT_TTL_MS = 30 * 60 * 1000;

/**
 * Crea un contexto vacío/inicial
 */
function createEmptyContext(): ConversationContext {
  return {
    state: 'idle',
    flavor: null,
    quantity: null,
    total: null,
    customerName: null,
    lastUpdated: Date.now(),
  };
}

/**
 * Obtiene el contexto de una conversación
 * @param phone - Número de teléfono (clave)
 * @returns El contexto existente o uno nuevo
 */
export function getContext(phone: string): ConversationContext {
  const existing = conversationStore.get(phone);

  // Si no existe, crear nuevo
  if (!existing) {
    const newContext = createEmptyContext();
    conversationStore.set(phone, newContext);
    return newContext;
  }

  // Si está expirado, resetear
  if (Date.now() - existing.lastUpdated > CONTEXT_TTL_MS) {
    const freshContext = createEmptyContext();
    conversationStore.set(phone, freshContext);
    return freshContext;
  }

  return existing;
}

/**
 * Actualiza el contexto de una conversación
 * @param phone - Número de teléfono
 * @param updates - Campos a actualizar
 */
export function updateContext(
  phone: string,
  updates: Partial<Omit<ConversationContext, 'lastUpdated'>>
): ConversationContext {
  const current = getContext(phone);
  const updated: ConversationContext = {
    ...current,
    ...updates,
    lastUpdated: Date.now(),
  };
  conversationStore.set(phone, updated);
  return updated;
}

/**
 * Establece el sabor seleccionado y cambia a estado awaiting_quantity
 * @param phone - Número de teléfono
 * @param flavor - Sabor elegido
 */
export function setFlavor(phone: string, flavor: FlavorName): ConversationContext {
  return updateContext(phone, {
    flavor,
    state: 'awaiting_quantity',
    // Resetear cantidad y total si había previos
    quantity: null,
    total: null,
  });
}

/**
 * Establece la cantidad y total, cambia a awaiting_confirmation
 * @param phone - Número de teléfono
 * @param quantity - Cantidad
 * @param total - Total calculado
 */
export function setQuantityAndTotal(
  phone: string,
  quantity: number,
  total: number
): ConversationContext {
  return updateContext(phone, {
    quantity,
    total,
    state: 'awaiting_confirmation',
  });
}

/**
 * Marca el pedido como confirmado, esperando pago
 */
export function confirmOrder(phone: string): ConversationContext {
  return updateContext(phone, {
    state: 'awaiting_payment',
  });
}

/**
 * Marca el pedido como completado
 */
export function completeOrder(phone: string): ConversationContext {
  return updateContext(phone, {
    state: 'completed',
  });
}

/**
 * Resetea el contexto a estado inicial
 */
export function resetContext(phone: string): ConversationContext {
  const freshContext = createEmptyContext();
  conversationStore.set(phone, freshContext);
  return freshContext;
}

/**
 * Limpia contextos expirados (para mantenimiento)
 * Se puede llamar periódicamente
 */
export function cleanupExpiredContexts(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [phone, context] of conversationStore.entries()) {
    if (now - context.lastUpdated > CONTEXT_TTL_MS) {
      conversationStore.delete(phone);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Obtiene el tamaño actual del store (para debugging)
 */
export function getStoreSize(): number {
  return conversationStore.size;
}
