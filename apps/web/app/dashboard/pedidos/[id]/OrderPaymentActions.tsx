'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isOrderPendingPayment } from '@/lib/order-utils';

type Props = {
  orderId: string;
  orderStatus: string | null;
};

export function OrderPaymentActions({ orderId, orderStatus }: Props) {
  // Mostrar acciones SOLO si el pedido está pendiente de pago
  if (!isOrderPendingPayment(orderStatus)) {
    return null;
  }

  const supabase = createClient();
  const [loading, setLoading] = useState<'paid' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(nextStatus: string, kind: 'paid' | 'rejected') {
    try {
      setLoading(kind);
      setError(null);

      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId);

      if (error) throw error;

      window.location.reload();
    } catch (e: any) {
      setError(e.message || 'Error actualizando el pedido');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-4 flex gap-2">
      {error && (
        <div className="mb-2 w-full rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={() => updateStatus('PAYMENT_CONFIRMED', 'paid')}
        disabled={loading !== null}
        className="flex-1 rounded bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading === 'paid' ? 'Procesando…' : 'Marcar Pagado'}
      </button>

      <button
        onClick={() => updateStatus('PAYMENT_REJECTED', 'rejected')}
        disabled={loading !== null}
        className="flex-1 rounded bg-red-600 px-4 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading === 'rejected' ? 'Procesando…' : 'No Pagado'}
      </button>
    </div>
  );
}
