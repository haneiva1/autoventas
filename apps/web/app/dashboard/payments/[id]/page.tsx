import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PaymentActions } from './PaymentActions';

interface PaymentDetail {
  id: string;
  reported_at: string;
  proof_message_text: string | null;
  proof_media_id: string | null;
  vendor_decision: string | null;
  orders: {
    id: string;
    customer_name: string | null;
    customer_phone: string;
    total_amount: number | null;
    currency: string | null;
    products_json: Array<{ name: string; quantity: number; price: number }>;
    delivery_method: string | null;
    delivery_address: string | null;
    status: string;
  };
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: payment, error } = await supabase
    .from('payments')
    .select(`
      id,
      reported_at,
      proof_message_text,
      proof_media_id,
      vendor_decision,
      orders!inner (
        id,
        customer_name,
        customer_phone,
        total_amount,
        currency,
        products_json,
        delivery_method,
        delivery_address,
        status
      )
    `)
    .eq('id', id)
    .single();

  if (error || !payment) {
    notFound();
  }

  const paymentData = payment as unknown as PaymentDetail;
  const isPending = paymentData.vendor_decision === null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Detalle de Pago</h1>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-blue-600 font-medium">Monto esperado</p>
              <p className="text-3xl font-bold text-gray-900">
                {paymentData.orders.currency || 'Bs'}{' '}
                {paymentData.orders.total_amount?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                {new Date(paymentData.reported_at).toLocaleString('es-BO')}
              </p>
              <span
                className={`mt-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  isPending
                    ? 'bg-yellow-100 text-yellow-800'
                    : paymentData.vendor_decision === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {isPending
                  ? 'Pendiente'
                  : paymentData.vendor_decision === 'approved'
                  ? 'Aprobado'
                  : 'Rechazado'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer info */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Cliente</h3>
          <p className="text-lg font-medium text-gray-900">
            {paymentData.orders.customer_name || 'Sin nombre'}
          </p>
          <p className="text-sm text-gray-600">{paymentData.orders.customer_phone}</p>
          {paymentData.orders.delivery_address && (
            <p className="text-sm text-gray-500 mt-1">
              {paymentData.orders.delivery_method}: {paymentData.orders.delivery_address}
            </p>
          )}
        </div>

        {/* Order items */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Productos</h3>
          {paymentData.orders.products_json &&
          paymentData.orders.products_json.length > 0 ? (
            <ul className="space-y-2">
              {paymentData.orders.products_json.map((item, index) => (
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
            <p className="text-sm text-gray-500 italic">
              Sin productos especificados (revisar manualmente)
            </p>
          )}
        </div>

        {/* Payment proof */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Mensaje del cliente
          </h3>
          {paymentData.proof_message_text ? (
            <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">
              &ldquo;{paymentData.proof_message_text}&rdquo;
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic">Sin mensaje de texto</p>
          )}
          {paymentData.proof_media_id && (
            <div className="mt-3">
              <p className="text-xs text-gray-500">
                Imagen adjunta (ID: {paymentData.proof_media_id})
              </p>
              <div className="mt-2 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <p className="text-sm text-gray-500">
                  Vista previa de imagen no disponible en modo mock
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="px-6 py-4 bg-gray-50">
            <PaymentActions paymentId={paymentData.id} />
          </div>
        )}
      </div>
    </div>
  );
}
