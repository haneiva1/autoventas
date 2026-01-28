import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { OrderPaymentActions } from './OrderPaymentActions';
import { isOrderConfirmed, isOrderRejected, isOrderPendingPayment } from '@/lib/order-utils';

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

interface PaymentDetail {
  id: string;
  status: string;
  vendor_decision: string | null;
  reported_by_phone: string | null;
  reported_at: string;
  proof_message_text: string | null;
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

  // Fetch the most relevant payment for this order:
  // 1. Prefer pending payment (vendor_decision IS NULL) - actionable
  // 2. Otherwise, get most recently decided payment
  const { data: pendingPayment } = await supabase
    .from('payments')
    .select('id, status, vendor_decision, reported_by_phone, reported_at, proof_message_text')
    .eq('order_id', id)
    .is('vendor_decision', null)
    .order('reported_at', { ascending: false })
    .limit(1)
    .single();

  let paymentData: PaymentDetail | null = pendingPayment as PaymentDetail | null;

  // If no pending payment, get the most recently decided one
  if (!paymentData) {
    const { data: decidedPayment } = await supabase
      .from('payments')
      .select('id, status, vendor_decision, reported_by_phone, reported_at, proof_message_text')
      .eq('order_id', id)
      .not('vendor_decision', 'is', null)
      .order('vendor_decided_at', { ascending: false })
      .limit(1)
      .single();

    paymentData = decidedPayment as PaymentDetail | null;
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-green-100 text-green-800',
      DELIVERED: 'bg-blue-100 text-blue-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Borrador',
      PENDING_PAYMENT: 'Pendiente Pago',
      CONFIRMED: 'Confirmado',
      DELIVERED: 'Entregado',
      CANCELLED: 'Cancelado',
    };
    return labels[status] || status;
  };

  const getPaymentStatusLabel = (status: string, decision: string | null) => {
    if (decision === 'approved') return 'Aprobado';
    if (decision === 'rejected') return 'Rechazado';
    const statusLabels: Record<string, string> = {
      pending: 'Pendiente',
      pending_review: 'Pendiente',
      approved: 'Aprobado',
      rejected: 'Rechazado',
    };
    return statusLabels[status] || status;
  };

  const getPaymentStatusBadge = (status: string, decision: string | null) => {
    if (decision === 'approved') return 'bg-green-100 text-green-800';
    if (decision === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  // Derive header status based on order status (single source of truth)
  const getDerivedStatus = (): { label: string; badge: string } => {
    if (isOrderConfirmed(orderData.status)) {
      return { label: 'Confirmado', badge: 'bg-green-100 text-green-800' };
    }
    if (isOrderRejected(orderData.status)) {
      return { label: 'Pago rechazado', badge: 'bg-red-100 text-red-800' };
    }
    if (isOrderPendingPayment(orderData.status)) {
      return { label: 'Pago pendiente', badge: 'bg-yellow-100 text-yellow-800' };
    }
    // Fallback (should not reach here given isOrderPendingPayment logic)
    return { label: getStatusLabel(orderData.status), badge: getStatusBadge(orderData.status) };
  };

  const derivedStatus = getDerivedStatus();

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
              order.status={orderData.status} | payment.status={paymentData?.status ?? 'null'} | payment.vendor_decision={paymentData?.vendor_decision ?? 'null'} | payment.reported_at={paymentData?.reported_at ?? 'null'}
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

        {/* Payment Info */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Pago</h3>
          {paymentData ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Estado:</span>
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPaymentStatusBadge(
                    paymentData.status,
                    paymentData.vendor_decision
                  )}`}
                >
                  {getPaymentStatusLabel(paymentData.status, paymentData.vendor_decision)}
                </span>
              </div>
              {paymentData.reported_by_phone && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Reportado por:</span>
                  <span>{paymentData.reported_by_phone}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Reportado:</span>
                <span>{new Date(paymentData.reported_at).toLocaleString('es-BO')}</span>
              </div>
              {paymentData.proof_message_text && (
                <div className="mt-2">
                  <p className="text-sm text-gray-600 mb-1">Mensaje del cliente:</p>
                  <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">
                    &ldquo;{paymentData.proof_message_text}&rdquo;
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Sin comprobante de pago registrado</p>
          )}
        </div>

        {/* Actions */}
        {isOrderPendingPayment(orderData.status) && (
          <div className="px-6 py-4 bg-gray-50">
            <OrderPaymentActions orderId={orderData.id} orderStatus={orderData.status} />
          </div>
        )}
      </div>
    </div>
  );
}
