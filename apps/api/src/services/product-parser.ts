export type Currency = 'BOB' | string;

export interface ProductLite {
  id: string;
  name: string;
  price: number | string;
  currency: Currency;
}

export interface ParsedProductOrder {
  product: ProductLite;
  quantity: number;
  score: number;
}

const STOPWORDS = new Set([
  'de','del','la','el','los','las','al','con','y','a','un','una','unos','unas',
  'por','para','en','mi','tu','su','porfa','porfavor','por favor','quiero',
  'dame','me','ponme','agrega','añade','anade','necesito','el','la','lo','pls',
  'bs','bob','bolivianos','boliviano'
]);

export function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[%$.,;:(){}\[\]!?"'´`^~_*+=<>|\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const t = normalizeText(input);
  const raw = t.split(' ').map(s => s.trim()).filter(Boolean);

  return raw
    .filter(tok => tok.length >= 2)
    .filter(tok => !STOPWORDS.has(tok));
}

export function extractQuantity(input: string): number {
  const t = normalizeText(input);

  // prefer patterns like "x2" or "2x"
  const m1 = t.match(/\bx\s*(\d{1,3})\b/);
  if (m1?.[1]) return clampQty(parseInt(m1[1], 10));

  const m2 = t.match(/\b(\d{1,3})\s*x\b/);
  if (m2?.[1]) return clampQty(parseInt(m2[1], 10));

  // otherwise first number
  const m3 = t.match(/\b(\d{1,3})\b/);
  if (m3?.[1]) return clampQty(parseInt(m3[1], 10));

  return 1;
}

function clampQty(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n > 99) return 99;
  return n;
}

function toNumberPrice(price: number | string): number {
  if (typeof price === 'number') return price;
  const p = Number(String(price).replace(',', '.'));
  return Number.isFinite(p) ? p : 0;
}

export function scoreProductMatch(userTokens: string[], productName: string): number {
  if (!userTokens.length) return 0;

  const nameNorm = normalizeText(productName);
  const nameTokens = tokenize(productName);

  if (!nameNorm || !nameTokens.length) return 0;

  let score = 0;

  // token overlap
  for (const tok of userTokens) {
    if (nameTokens.includes(tok)) score += 3;
    else if (nameNorm.includes(tok)) score += 1;
  }

  // phrase bonus: if user text (joined) is a substring of product name
  const userPhrase = userTokens.join(' ');
  if (userPhrase.length >= 4 && nameNorm.includes(userPhrase)) score += 4;

  // all-tokens bonus (for narrower matches)
  const allIn = userTokens.every(tok => nameNorm.includes(tok));
  if (allIn && userTokens.length >= 2) score += 5;

  // slight penalty for very generic matches on very short token sets
  if (userTokens.length === 1 && score > 0) score -= 1;

  return Math.max(0, score);
}

export function findBestMatchingProduct(
  userText: string,
  products: ProductLite[]
): { product: ProductLite | null; score: number } {
  const userTokens = tokenize(userText);
  if (!userTokens.length) return { product: null, score: 0 };

  let best: ProductLite | null = null;
  let bestScore = 0;

  for (const p of products) {
    const s = scoreProductMatch(userTokens, p.name);
    if (s > bestScore) {
      best = p;
      bestScore = s;
      continue;
    }

    // tie-break: prefer shorter name (more specific) if same score
    if (s === bestScore && s > 0 && best && p.name.length < best.name.length) {
      best = p;
      bestScore = s;
    }
  }

  // require minimal confidence
  if (!best || bestScore < 3) return { product: null, score: 0 };
  return { product: best, score: bestScore };
}

export function parseProductOrder(
  userText: string,
  products: ProductLite[]
): ParsedProductOrder | null {
  const qty = extractQuantity(userText);
  const { product, score } = findBestMatchingProduct(userText, products);
  if (!product) return null;

  return { product, quantity: qty, score };
}

export function addToCart(
  cart: Array<{ productId: string; name: string; quantity: number; price: number }>,
  parsed: ParsedProductOrder
) {
  const unitPrice = typeof parsed.product.price === 'number'
    ? parsed.product.price
    : Number(parsed.product.price);

  const idx = cart.findIndex(i => i.productId === parsed.product.id);

  if (idx >= 0) {
    cart[idx].quantity += parsed.quantity;
  } else {
    cart.push({
      productId: parsed.product.id,
      name: parsed.product.name,
      quantity: parsed.quantity,
      price: unitPrice,
    });
  }

  return cart;
}

export function calcCartTotal(
  cart: Array<{ price: number; quantity: number }>
): number {
  return cart.reduce((sum, it) => sum + it.price * it.quantity, 0);
}
