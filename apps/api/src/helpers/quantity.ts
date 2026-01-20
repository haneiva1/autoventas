/**
 * Helper para inferir cantidad de un mensaje de texto
 * Detecta números, texto en español, y frases con cantidad
 */

// Mapeo de palabras en español a números
const WORD_TO_NUMBER: Record<string, number> = {
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  media: 0.5,
  medio: 0.5,
};

/**
 * Infiere una cantidad desde un mensaje de texto
 * @param text - El mensaje del usuario
 * @returns El número inferido o null si no se detecta cantidad
 *
 * Ejemplos:
 *   "2" → 2
 *   "quiero 3 tabletas" → 3
 *   "dos por favor" → 2
 *   "me llevo tres" → 3
 *   "uno" → 1
 *   "hola" → null
 */
export function inferQuantity(text: string): number | null {
  const normalized = text.toLowerCase().trim();

  // 1. Buscar número explícito (solo dígitos)
  //    Patrones: "2", "quiero 3", "dame 5 tabletas", "10 unidades"
  const digitMatch = normalized.match(/\b(\d+)\b/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    if (num > 0 && num <= 100) {
      return num;
    }
  }

  // 2. Buscar palabras numéricas en español
  for (const [word, value] of Object.entries(WORD_TO_NUMBER)) {
    // Match palabra completa (no parcial)
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(normalized)) {
      return value;
    }
  }

  // 3. No se detectó cantidad
  return null;
}

/**
 * Verifica si un mensaje parece ser una confirmación de cantidad
 * Útil para detectar intención de compra con cantidad
 */
export function isQuantityMessage(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  // Patrones que indican que el usuario está dando una cantidad
  const quantityPatterns = [
    /^\d+$/, // Solo número: "2", "5"
    /^(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$/i, // Solo palabra
    /\b(quiero|dame|necesito|manda|envía|envia|llevo|pido)\s+\d+/i, // "quiero 3"
    /\b\d+\s*(tabletas?|unidades?|paquetes?|cajas?|piezas?)/i, // "3 tabletas"
    /\b(quiero|dame|llevo)\s+(uno|una|dos|tres|cuatro|cinco)/i, // "quiero dos"
  ];

  return quantityPatterns.some(pattern => pattern.test(normalized));
}
