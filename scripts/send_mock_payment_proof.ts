/**
 * Mock script: Send a fake payment proof message
 *
 * Usage: pnpm --filter scripts mock:payment
 *
 * This script:
 * 1. Creates a test order if none exists
 * 2. Sends a mock payment proof message via webhook
 * 3. Verifies the PaymentReview was created
 */

import { createClient } from '@supabase/supabase-js';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT_ID = process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  console.error('Copy .env.example to .env and fill in the values');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const customerPhone = '59171234567';
const customerName = 'Juan Test';
const messageId = `mock_payment_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();

async function ensureTestOrder(): Promise<string> {
  // Check if there's an existing pending order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_phone', customerPhone)
    .in('status', ['DRAFT', 'PENDING_PAYMENT'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existingOrder) {
    console.log(`Using existing order: ${existingOrder.id}`);
    return existingOrder.id;
  }

  // Create a test order
  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert({
      customer_phone: customerPhone,
      customer_name: customerName,
      products_json: [
        { name: 'Producto Demo A', quantity: 2, price: 50.0 },
        { name: 'Producto Demo B', quantity: 1, price: 75.0 },
      ],
      total_amount: 175.0,
      currency: 'BOB',
      status: 'PENDING_PAYMENT',
      delivery_method: 'delivery',
      delivery_address: 'Calle Falsa 123, La Paz',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create test order:', error.message);
    process.exit(1);
  }

  console.log(`Created test order: ${newOrder.id}`);
  return newOrder.id;
}

// Mock payment proof with image (simulated)
const createMockPayload = (hasImage: boolean) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'PHONE_NUMBER_ID',
            },
            contacts: [
              {
                profile: {
                  name: customerName,
                },
                wa_id: customerPhone,
              },
            ],
            messages: [
              hasImage
                ? {
                    from: customerPhone,
                    id: messageId,
                    timestamp,
                    type: 'image',
                    image: {
                      caption: 'Ya pagué, aquí está el comprobante de la transferencia',
                      mime_type: 'image/jpeg',
                      sha256: 'mock_sha256_hash',
                      id: `mock_media_${Date.now()}`,
                    },
                  }
                : {
                    from: customerPhone,
                    id: messageId,
                    timestamp,
                    type: 'text',
                    text: {
                      body: 'Ya pagué por transferencia bancaria, el monto de Bs 175',
                    },
                  },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
});

async function sendMockPaymentProof() {
  console.log('=== Mock Payment Proof Test ===\n');

  // Step 1: Ensure we have a test order
  console.log('Step 1: Ensuring test order exists...');
  const orderId = await ensureTestOrder();
  console.log('');

  // Step 2: Send mock payment proof
  console.log('Step 2: Sending mock payment proof...');
  console.log('Message ID:', messageId);

  const startTime = Date.now();
  const payload = createMockPayload(true); // with image

  try {
    const response = await fetch(`${API_URL}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const duration = Date.now() - startTime;
    console.log(`Response status: ${response.status}`);
    console.log(`Response time: ${duration}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error:', errorText);
      process.exit(1);
    }

    const data = await response.json();
    console.log('Response:', data);
    console.log('');

    // Wait for async processing
    console.log('Step 3: Waiting for async processing...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Verify PaymentReview was created
    console.log('Step 4: Verifying PaymentReview creation...');

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        orders (
          id,
          customer_name,
          total_amount,
          status
        )
      `)
      .eq('order_id', orderId)
      .order('reported_at', { ascending: false })
      .limit(1)
      .single();

    if (paymentError) {
      console.error('Payment not found:', paymentError.message);

      // Check if any payments exist for debugging
      const { data: allPayments } = await supabase
        .from('payments')
        .select('id, order_id, reported_at')
        .order('reported_at', { ascending: false })
        .limit(5);

      console.log('Recent payments:', allPayments);
    } else {
      console.log('');
      console.log('PaymentReview created:');
      console.log(`  Payment ID: ${payment.id}`);
      console.log(`  Order ID: ${payment.order_id}`);
      console.log(`  Status: ${payment.status}`);
      console.log(`  Proof Media ID: ${payment.proof_media_id || 'N/A'}`);
      console.log(`  Proof Text: ${payment.proof_message_text || 'N/A'}`);
      console.log(`  Reported At: ${payment.reported_at}`);
      console.log(`  Vendor Decision: ${payment.vendor_decision || 'Pending'}`);
      if (payment.orders) {
        console.log('');
        console.log('Associated Order:');
        console.log(`  Customer: ${payment.orders.customer_name}`);
        console.log(`  Total: Bs ${payment.orders.total_amount}`);
        console.log(`  Status: ${payment.orders.status}`);
      }
    }

    // Step 5: Check notification was created
    console.log('');
    console.log('Step 5: Checking merchant notification...');

    const { data: notification } = await supabase
      .from('vendi_merchant_notifications')
      .select('*')
      .eq('reference_id', payment?.id)
      .eq('notification_type', 'payment_proof')
      .single();

    if (notification) {
      console.log('Notification created:');
      console.log(`  ID: ${notification.id}`);
      console.log(`  Title: ${notification.title}`);
      console.log(`  Body: ${notification.body}`);
    } else {
      console.log('No notification found (may need to check reference_id)');
    }

    console.log('');
    console.log('=== Test Summary ===');
    console.log(`Order ID: ${orderId}`);
    console.log(`Payment ID: ${payment?.id || 'N/A'}`);
    console.log(`Status: ${payment ? 'SUCCESS' : 'FAILED'}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Start the web app: pnpm dev:web');
    console.log('2. Login at http://localhost:3000/login');
    console.log('3. Review the pending payment in the dashboard');
    console.log('4. Click "Marcar Pagado" or "No Pagado"');
  } catch (error) {
    console.error('Failed to send mock payment proof:', error);
    process.exit(1);
  }
}

sendMockPaymentProof();
