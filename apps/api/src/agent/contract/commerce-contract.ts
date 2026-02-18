// CONTRATO FINAL - AGENTE VENDEDOR RUH V1
// Este archivo NO conoce WhatsApp, DB ni Fastify.
// Solo decide qué hacer.

export type DeliveryMethod = 'PICKUP' | 'DELIVERY' | null;

export interface CartItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface ContractState {
  step: 'START' | 'BROWSING' | 'CART' | 'PAYMENT';
  hasSeenCatalog: boolean;
  cart: CartItem[];
  deliveryMethod: DeliveryMethod;
  totalAmount: number;
}

export type Decision =
  | { type: 'SHOW_WELCOME' }
  | { type: 'SHOW_CATALOG' }
  | { type: 'ADD_TO_CART'; item: CartItem }
  | { type: 'SHOW_CART'; cart: CartItem[]; total: number }
  | { type: 'ASK_DELIVERY_METHOD' }
  | { type: 'SET_DELIVERY_METHOD'; method: DeliveryMethod }
  | { type: 'CONFIRM_ORDER'; cart: CartItem[]; total: number; delivery: DeliveryMethod }
  | { type: 'READY_FOR_PAYMENT'; cart: CartItem[]; total: number; delivery: DeliveryMethod }
  | { type: 'NO_OP' }
  | { type: 'FALLBACK_HUMAN' };

export interface ContractInput {
  messageText: string;
  state: ContractState;
}

/**
 * Catálogo mínimo V1 (mock).
 */
const CATALOG = [
  { productId: 'classic', name: 'chocolate clásico', price: 20 },
  { productId: 'relleno', name: 'chocolate relleno', price: 25 },
];

function findProduct(text: string) {
  return CATALOG.find(p => text.includes(p.name));
}

function parseQuantity(text: string): number {
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function calculateTotal(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
}

export function decideContract(input: ContractInput): Decision {
  const text = input.messageText.toLowerCase().trim();
  const state = input.state;

  // Saludo
  if (['hola', 'buenas', 'hello'].some(w => text.startsWith(w))) {
    return { type: 'SHOW_WELCOME' };
  }

  // Ver catálogo
  if (text.includes('catalog')) {
    return { type: 'SHOW_CATALOG' };
  }

  // Agregar producto
  if (text.includes('quiero') || text.includes('agrega') || text.includes('dame')) {
    const product = findProduct(text);
    if (!product) return { type: 'NO_OP' };

    const qty = parseQuantity(text);
    return {
      type: 'ADD_TO_CART',
      item: {
        productId: product.productId,
        name: product.name,
        qty,
        unitPrice: product.price,
      },
    };
  }

  // Ver / confirmar carrito
  if (text.includes('ver carrito') || text.includes('pedido')) {
    if (state.cart.length === 0) {
      return { type: 'ASK_DELIVERY_METHOD' };
    }
    const total = calculateTotal(state.cart);
    return { type: 'SHOW_CART', cart: state.cart, total };
  }

  // Elegir método de entrega
  if (text.includes('envio')) {
    return { type: 'SET_DELIVERY_METHOD', method: 'DELIVERY' };
  }

  if (text.includes('recoger') || text.includes('retiro')) {
    return { type: 'SET_DELIVERY_METHOD', method: 'PICKUP' };
  }

  // Confirmar pedido (todo listo)
  if (text.includes('confirmar') || text.includes('ok')) {
    if (state.cart.length === 0) return { type: 'NO_OP' };
    if (!state.deliveryMethod) return { type: 'ASK_DELIVERY_METHOD' };

    const total = calculateTotal(state.cart);
    return {
      type: 'READY_FOR_PAYMENT',
      cart: state.cart,
      total,
      delivery: state.deliveryMethod,
    };
  }

  return { type: 'NO_OP' };
}
