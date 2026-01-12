import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface OutboundMessage {
  id: string;
  created_at: string;
  to_phone: string;
  body: string;
  status: string;
  order_id: string | null;
  message_type: string;
  error: string | null;
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('outbound_messages')
    .select('id, created_at, to_phone, body, status, order_id, message_type, error')
    .order('created_at', { ascending: false })
    .limit(50);

  // Apply status filter if provided
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error('Error fetching outbound messages:', error);
  }

  const messageList = (messages || []) as OutboundMessage[];

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      canceled: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      sent: 'Enviado',
      failed: 'Fallido',
      canceled: 'Cancelado',
    };
    return labels[status] || status;
  };

  const truncateBody = (body: string, maxLength: number = 50) => {
    if (body.length <= maxLength) return body;
    return body.substring(0, maxLength) + '...';
  };

  const statusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'sent', label: 'Enviados' },
    { value: 'failed', label: 'Fallidos' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cola de Mensajes Salientes</h1>
        <p className="text-sm text-gray-600 mt-1">
          Mensajes pendientes de enviar por WhatsApp
        </p>
      </div>

      {/* Status Filter */}
      <div className="mb-4 flex gap-2">
        {statusOptions.map((option) => (
          <Link
            key={option.value}
            href={`/dashboard/outbox${option.value !== 'all' ? `?status=${option.value}` : ''}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              (statusFilter || 'all') === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {messageList.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-500">No hay mensajes en la cola</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destinatario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mensaje
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pedido
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {messageList.map((message) => (
                <tr key={message.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(message.created_at).toLocaleString('es-BO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {message.to_phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(
                        message.status
                      )}`}
                    >
                      {getStatusLabel(message.status)}
                    </span>
                    {message.error && (
                      <p className="text-xs text-red-500 mt-1" title={message.error}>
                        {truncateBody(message.error, 30)}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs" title={message.body}>
                      {truncateBody(message.body)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {message.order_id ? (
                      <Link
                        href={`/dashboard/pedidos/${message.order_id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Ver pedido
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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
