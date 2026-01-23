/**
 * Module: createPendingOrder
 * Purpose: Create a pending order and associated pending payment in Supabase.
 *
 * This module is isolated and does NOT modify schema, routes, or other services.
 */

import { supabaseAdmin } from '../../lib/supabase.js';

// ============================================================================
// Types
// ============================================================================

export type CreatePendingOrderInput = {
  customerPhone: string;            // REQUIRED
  customerName?: string;
  productsJson?: unknown;
  totalAmount?: number;             // numeric
  currency?: string;                // default BOB
  conversationId: string;           // REQUIRED
  tenantId: string;                 // REQUIRED
  source: 'whatsapp';               // literal, for traceability (not persisted)
};

export type CreatePendingOrderResult =
  | { ok: true; orderId: string; paymentId: string }
  | { ok: false; error: string };

// ============================================================================
// Constants
// ============================================================================

const REQUIRED_PAYMENTS_COLUMNS = ['order_id', 'conversation_id', 'tenant_id'] as const;

// ============================================================================
// Helper: Verify payments table has required columns
// ============================================================================

async function verifyPaymentsSchema(): Promise<{ valid: true } | { valid: false; missing: string[] }> {
  // Attempt a SELECT with LIMIT 0 to verify columns exist without fetching data.
  // If columns don't exist, Supabase will return an error mentioning the missing column.
  const testResult = await supabaseAdmin
    .from('payments')
    .select('order_id, conversation_id, tenant_id')
    .limit(0);

  if (testResult.error) {
    // If there's an error, test each column individually to find which are missing
    const missingCols: string[] = [];

    for (const col of REQUIRED_PAYMENTS_COLUMNS) {
      const singleTest = await supabaseAdmin
        .from('payments')
        .select(col)
        .limit(0);

      if (singleTest.error) {
        missingCols.push(col);
      }
    }

    if (missingCols.length > 0) {
      return { valid: false, missing: missingCols };
    }

    // If no individual column errors, the original error was something else
    // (e.g., table doesn't exist). Return generic error.
    return { valid: false, missing: ['(unable to verify schema - ' + testResult.error.message + ')'] };
  }

  // If we got here without errors, columns exist
  return { valid: true };
}

// ============================================================================
// Main function
// ============================================================================

export async function createPendingOrder(
  input: CreatePendingOrderInput
): Promise<CreatePendingOrderResult> {
  // 1. Validate required inputs defensively
  if (!input.customerPhone || typeof input.customerPhone !== 'string') {
    return { ok: false, error: 'Missing or invalid customerPhone' };
  }
  if (!input.conversationId || typeof input.conversationId !== 'string') {
    return { ok: false, error: 'Missing or invalid conversationId' };
  }
  if (!input.tenantId || typeof input.tenantId !== 'string') {
    return { ok: false, error: 'Missing or invalid tenantId' };
  }

  // 2. Verify payments table schema before proceeding
  const schemaCheck = await verifyPaymentsSchema();
  if (!schemaCheck.valid) {
    return {
      ok: false,
      error: `payments table missing required columns: ${schemaCheck.missing.join(', ')}`,
    };
  }

  // 3. Insert into orders table
  const orderPayload: Record<string, unknown> = {
    customer_phone: input.customerPhone,
  };

  if (input.customerName !== undefined) {
    orderPayload.customer_name = input.customerName;
  }
  if (input.productsJson !== undefined) {
    orderPayload.products_json = input.productsJson;
  }
  if (input.totalAmount !== undefined) {
    orderPayload.total_amount = input.totalAmount;
  }
  if (input.currency !== undefined) {
    orderPayload.currency = input.currency;
  }
  // status defaults to 'INICIO' per schema, do not override

  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select('id')
    .single();

  if (orderError) {
    return {
      ok: false,
      error: `Failed to insert order: ${orderError.message}`,
    };
  }

  if (!orderData || !orderData.id) {
    return {
      ok: false,
      error: 'Order insert succeeded but no id returned',
    };
  }

  const orderId = orderData.id as string;

  // 4. Insert into payments table
  const paymentPayload: Record<string, unknown> = {
    order_id: orderId,
    conversation_id: input.conversationId,
    tenant_id: input.tenantId,
    // status defaults to 'pending' per schema, do not override
  };

  const { data: paymentData, error: paymentError } = await supabaseAdmin
    .from('payments')
    .insert(paymentPayload)
    .select('id')
    .single();

  if (paymentError) {
    // Note: Order was already created. In a production system you might want
    // to implement compensation/rollback, but per requirements we return error.
    return {
      ok: false,
      error: `Order created (id=${orderId}) but payment insert failed: ${paymentError.message}`,
    };
  }

  if (!paymentData || !paymentData.id) {
    return {
      ok: false,
      error: `Order created (id=${orderId}) but payment insert returned no id`,
    };
  }

  const paymentId = paymentData.id as string;

  // 5. Success
  return {
    ok: true,
    orderId,
    paymentId,
  };
}
