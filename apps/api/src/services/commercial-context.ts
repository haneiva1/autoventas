import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function buildCommercialContext(): Promise<string> {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return `
No se pudo cargar el catálogo en este momento.
Responda de forma general y ofrezca derivar a un asesor humano si es necesario.
`;
    }

    const { data: products, error } = await supabase
      .from("vendi_products")
      .select("name, description, price, currency")
      .order("name");

    if (error || !products || products.length === 0) {
      return `
No hay productos disponibles en este momento.
Si el cliente solicita información específica, un asesor humano continuará la atención.
`;
    }

    const productList = products
      .map(
        (p, i) => `
${i + 1}. ${p.name}
Precio: ${p.price} ${p.currency}
Descripción: ${p.description}`
      )
      .join("\n");

    return `
Catálogo disponible de Chocolates Ruah (precios en BOB):

${productList}

Reglas comerciales:
- Solo puedes ofrecer productos listados arriba.
- No inventes productos, precios ni promociones.
- Si el cliente pide algo fuera del catálogo, indícalo con claridad.
`;
  } catch {
    return `
No se pudo cargar el catálogo en este momento.
Responda de forma general y ofrezca derivar a un asesor humano si es necesario.
`;
  }
}
