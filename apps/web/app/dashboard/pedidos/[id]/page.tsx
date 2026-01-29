import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { OrderPaymentActions } from './OrderPaymentActions';

interface OrderDetail {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  total_amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  products_json: Array<{ name: string; quantity: number; price: number }> | null;
  delivery_method: string | null;
  delivery_address: string | null;
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const { id } = await params;
  const { debug } = await searchParams;
  const showDebug = process.env.NODE_ENV !== 'production' && debug === '1';
  const supabase = await createClient();

  // Fetch order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    notFound();
  }

  const orderData = order as OrderDetail;

const products = Array.isArray(orderData.products_json) ? orderData.products_json.filter(p => p && typeof p.quantity === "number" && typeof p.price === "number") : [];

  // Inline status config: PAYMENT_PENDING or PAID only
  const derivedStatus = orderData.status === 'PAID'
    ? { label: 'Confirmado', badge: 'bg-green-100 text-green-800' }
    : { label: 'Pago pendiente', badge: 'bg-yellow-100 text-yellow-800' };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Detalle del Pedido</h1>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Order Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total</p>
              <p className="text-3xl font-bold text-gray-900">
                {orderData.currency || 'Bs'}{' '}
                {orderData.total_amount?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                {new Date(orderData.created_at).toLocaleString('es-BO')}
              </p>
              <span
                className={`mt-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${derivedStatus.badge}`}
              >
                {derivedStatus.label}
              </span>
            </div>
          </div>
          {/* Debug info - only in dev with ?debug=1 */}
          {showDebug && (
            <div className="mt-2 text-xs text-gray-400 font-mono">
              order.status={orderData.status}
            </div>
          )}
        </div>

        {/* Customer Info */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Cliente</h3>
          <p className="text-lg font-medium text-gray-900">
            {orderData.customer_name || 'Sin nombre'}
          </p>
          <p className="text-sm text-gray-600">{orderData.customer_phone}</p>
          {orderData.delivery_address && (
            <p className="text-sm text-gray-500 mt-1">
              {orderData.delivery_method}: {orderData.delivery_address}
            </p>
          )}
        </div>

        {/* Products */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Productos</h3>
          {products && products.length > 0 ? (
            <ul className="space-y-2">
              {products.map((item, index) => (
                <li key={index} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="text-gray-600">
                    Bs {(item.price * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">Sin productos especificados</p>
          )}
        </div>

        {/* Actions */}
        {orderData.status === 'PAYMENT_PENDING' && (
          <div className="px-6 py-4 bg-gray-50">
            <OrderPaymentActions orderId={orderData.id} orderStatus={orderData.status} />
          </div>
        )}
      </div>
    </div>
  );
}
