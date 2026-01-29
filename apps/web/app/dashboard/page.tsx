import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'PAYMENT_PENDING')
    .order('created_at', { ascending: false });

  const pendingOrders = orders ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pagos Pendientes</h1>
        <p className="text-sm text-gray-600 mt-1">
          Revisa y aprueba los comprobantes de pago de tus clientes
        </p>
      </div>

      {pendingOrders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-500">No hay pagos pendientes de revisar</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {order.customer_name || 'Sin nombre'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {order.customer_phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {order.currency || 'Bs'}{' '}
                      {order.total_amount?.toFixed(2) || '0.00'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString('es-BO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {order.status === 'PAID' ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Confirmado</span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pendiente</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/dashboard/pedidos/${order.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
