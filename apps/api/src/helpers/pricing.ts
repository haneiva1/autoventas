/**
 * Estructura de precios y helpers de cálculo
 * Centraliza todos los precios del catálogo
 */

// Tipo para los sabores disponibles
export type FlavorName =
  | 'maracuya'
  | 'matcha'
  | 'menta'
  | 'naranja'
  | 'clasico'
  | 'cafe'
  | 'cilantro';

// Catálogo de precios por sabor (en Bs)
export const PRICES: Record<FlavorName, number> = {
  maracuya: 30,
  matcha: 29,
  menta: 29,
  naranja: 29,
  clasico: 26,
  cafe: 26,
  cilantro: 26,
};

// Lista de sabores disponibles para validación
export const AVAILABLE_FLAVORS: FlavorName[] = Object.keys(PRICES) as FlavorName[];

/**
 * Obtiene el precio de un sabor
 * @param flavor - Nombre del sabor
 * @returns El precio o null si no existe
 */
export function getPrice(flavor: string): number | null {
  const normalized = flavor.toLowerCase().trim() as FlavorName;
  return PRICES[normalized] ?? null;
}

/**
 * Verifica si un sabor es válido
 * @param flavor - Nombre del sabor a verificar
 */
export function isValidFlavor(flavor: string): flavor is FlavorName {
  const normalized = flavor.toLowerCase().trim();
  return normalized in PRICES;
}

/**
 * Calcula el total de una compra
 * @param flavor - Sabor seleccionado
 * @param quantity - Cantidad
 * @returns El total calculado o null si el sabor no es válido
 */
export function calculateTotal(flavor: string, quantity: number): number | null {
  const price = getPrice(flavor);
  if (price === null || quantity <= 0) {
    return null;
  }
  return price * quantity;
}

/**
 * Formatea el precio para mostrar al usuario
 * @param amount - Cantidad en Bs
 * @returns String formateado (ej: "Bs 87")
 */
export function formatPrice(amount: number): string {
  return `Bs ${amount}`;
}

/**
 * Genera un resumen de pedido para confirmación
 * @param flavor - Sabor seleccionado
 * @param quantity - Cantidad
 * @returns Objeto con detalles del pedido o null si inválido
 */
export function generateOrderSummary(flavor: string, quantity: number): {
  flavor: FlavorName;
  quantity: number;
  unitPrice: number;
  total: number;
  summary: string;
} | null {
  const price = getPrice(flavor);
  if (price === null || quantity <= 0) {
    return null;
  }

  const total = price * quantity;
  const normalizedFlavor = flavor.toLowerCase().trim() as FlavorName;

  // Capitalizar primera letra del sabor
  const flavorDisplay = normalizedFlavor.charAt(0).toUpperCase() + normalizedFlavor.slice(1);

  const unitText = quantity === 1 ? 'tableta' : 'tabletas';

  return {
    flavor: normalizedFlavor,
    quantity,
    unitPrice: price,
    total,
    summary: `${quantity} ${unitText} de ${flavorDisplay} = ${formatPrice(total)}`,
  };
}
