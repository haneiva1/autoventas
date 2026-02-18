import { supabaseAdmin } from '../lib/supabase';

export async function createOrderOnConfirmation({
  phone,
  products,
  totalAmount,
  customerName,
}: {
  phone: string;
  products: any[];
  totalAmount: number;
  customerName?: string;
}) {
  try {
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) return;

    await supabaseAdmin.from('orders').insert({
      customer_phone: phone,
      customer_name: customerName ?? null,
      products_json: products,
      total_amount: totalAmount,
      currency: 'BOB',
      status: 'INICIO',
    });

    console.log('[ORDER] Created order on confirmation');
  } catch (e) {
    console.error('[ORDER] Failed to create order on confirmation', e);
  }
}
