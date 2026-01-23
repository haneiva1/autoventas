/**
 * Module: handlePaymentConfirmation
 * Purpose: Create order and payment records when payment confirmation is received.
 *
 * This module is isolated and does NOT modify schema, routes, or other services.
 * No messaging, no conversation state changes.
 */

import { supabaseAdmin } from '../../lib/supabase.js';

// ============================================================================
// Types
// ============================================================================

export type HandlePaymentConfirmationInput = {
  phone: string;
  customerName?: string | null;
  productsJson?: unknown;
  totalAmount?: number | null;
  currency: string;
};

export type HandlePaymentConfirmationResult =
  | { ok: true; orderId: string; paymentId: string }
  | { ok: false; reason: 'NO_MATCH' | 'ERROR'; error?: string };

// ============================================================================
// Main function
// ============================================================================

export async function handlePaymentConfirmation(
  input: HandlePaymentConfirmationInput
): Promise<HandlePaymentConfirmationResult> {
  try {
    // 1. Insert into orders table
    const orderPayload: Record<string, unknown> = {
      customer_phone: input.phone,
      customer_name: input.customerName ?? null,
      products_json: input.productsJson ?? null,
      total_amount: input.totalAmount ?? null,
      currency: input.currency || 'BOB',
      status: 'pending_payment',
    };

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert(orderPayload)
      .select('id')
      .single();

    if (orderError) {
      return {
        ok: false,
        reason: 'ERROR',
        error: `Failed to insert order: ${orderError.message}`,
      };
    }

    if (!orderData || !orderData.id) {
      return {
        ok: false,
        reason: 'ERROR',
        error: 'Order insert succeeded but no id returned',
      };
    }

    const orderId = orderData.id as string;

    // 2. Insert into payments table linked to order
    const paymentPayload: Record<string, unknown> = {
      order_id: orderId,
    };

    const { data: paymentData, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert(paymentPayload)
      .select('id')
      .single();

    if (paymentError) {
      return {
        ok: false,
        reason: 'ERROR',
        error: `Order created (id=${orderId}) but payment insert failed: ${paymentError.message}`,
      };
    }

    if (!paymentData || !paymentData.id) {
      return {
        ok: false,
        reason: 'ERROR',
        error: `Order created (id=${orderId}) but payment insert returned no id`,
      };
    }

    const paymentId = paymentData.id as string;

    // 3. Success
    return {
      ok: true,
      orderId,
      paymentId,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
