/**
 * Detector de sabores en mensajes de texto
 * Identifica cuándo un usuario menciona un sabor del catálogo
 */

import { AVAILABLE_FLAVORS, type FlavorName } from './pricing.js';

// Mapeo de variaciones/alias a sabores canónicos
const FLAVOR_ALIASES: Record<string, FlavorName> = {
  // Maracuyá
  maracuya: 'maracuya',
  maracuyá: 'maracuya',
  'maracuja': 'maracuya',
  'passion fruit': 'maracuya',

  // Matcha
  matcha: 'matcha',
  'te verde': 'matcha',
  'té verde': 'matcha',

  // Menta
  menta: 'menta',
  'menta chocolate': 'menta',
  'chocolate menta': 'menta',
  mint: 'menta',

  // Naranja
  naranja: 'naranja',
  orange: 'naranja',
  'naranja chocolate': 'naranja',

  // Clásico
  clasico: 'clasico',
  clásico: 'clasico',
  classic: 'clasico',
  tradicional: 'clasico',
  original: 'clasico',
  normal: 'clasico',

  // Café
  cafe: 'cafe',
  café: 'cafe',
  coffee: 'cafe',
  'cafe chocolate': 'cafe',

  // Cilantro
  cilantro: 'cilantro',
  coriander: 'cilantro',
};

/**
 * Detecta si un mensaje menciona un sabor del catálogo
 * @param text - Mensaje del usuario
 * @returns El sabor detectado o null
 *
 * Ejemplos:
 *   "quiero maracuyá" → "maracuya"
 *   "dame el de menta" → "menta"
 *   "hola" → null
 *   "el clásico" → "clasico"
 */
export function detectFlavor(text: string): FlavorName | null {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Quitar acentos para matching

  // Primero buscar en aliases (incluye variaciones con acento)
  for (const [alias, flavor] of Object.entries(FLAVOR_ALIASES)) {
    const aliasNormalized = alias
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Buscar como palabra completa
    const regex = new RegExp(`\\b${escapeRegex(aliasNormalized)}\\b`, 'i');
    if (regex.test(normalized)) {
      return flavor;
    }
  }

  // Buscar directamente en lista de sabores disponibles
  for (const flavor of AVAILABLE_FLAVORS) {
    const regex = new RegExp(`\\b${escapeRegex(flavor)}\\b`, 'i');
    if (regex.test(normalized)) {
      return flavor;
    }
  }

  return null;
}

/**
 * Verifica si un mensaje parece ser una selección de sabor
 * (útil para detectar intención, no solo mención)
 */
export function isFlavorSelection(text: string): boolean {
  const normalized = text.toLowerCase();
  const flavor = detectFlavor(text);

  if (!flavor) return false;

  // Patrones que indican selección explícita
  const selectionPatterns = [
    /^(el\s+)?(de\s+)?[\w]+$/i, // "el de menta", "menta", "el clásico"
    /\b(quiero|dame|el|la|de|prefiero)\s/i, // "quiero matcha"
    /\b(ese|esa|eso)\b/i, // "ese de naranja"
  ];

  // Si el mensaje es muy corto (solo el sabor), es selección
  if (normalized.split(/\s+/).length <= 3) {
    return true;
  }

  return selectionPatterns.some(p => p.test(normalized));
}

/**
 * Escapa caracteres especiales para uso en regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Obtiene todos los sabores mencionados en un texto
 * (para casos donde el usuario menciona varios)
 */
export function detectAllFlavors(text: string): FlavorName[] {
  const found: FlavorName[] = [];
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const flavor of AVAILABLE_FLAVORS) {
    const regex = new RegExp(`\\b${escapeRegex(flavor)}\\b`, 'i');
    if (regex.test(normalized)) {
      found.push(flavor);
    }
  }

  return found;
}
