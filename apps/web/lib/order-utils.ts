/**
 * Canonical order status helpers for the dashboard.
 *
 * Business rules:
 * - orders.status is the single source of truth
 * - An order is "pending payment" if it has NOT reached a final state
 * - Unknown/legacy statuses are treated as pending (safe MVP default)
 */

/** Final states: order confirmed/paid */
const CONFIRMED_STATUSES = [
  'CONFIRMED',
  'CONFIRMADO',
  'confirmed',
  'PAID',
  'PAYMENT_CONFIRMED',
] as const;

/** Final states: payment rejected */
const REJECTED_STATUSES = [
  'PAYMENT_REJECTED',
] as const;

/** All final/terminal states (no action needed) */
const FINAL_STATUSES = [
  ...CONFIRMED_STATUSES,
  ...REJECTED_STATUSES,
  'DELIVERED',
  'CANCELLED',
] as const;

/**
 * Check if order status indicates confirmed payment.
 */
export function isOrderConfirmed(status: string | null | undefined): boolean {
  if (!status) return false;
  return (CONFIRMED_STATUSES as readonly string[]).includes(status);
}

/**
 * Check if order status indicates rejected payment.
 */
export function isOrderRejected(status: string | null | undefined): boolean {
  if (!status) return false;
  return (REJECTED_STATUSES as readonly string[]).includes(status);
}

/**
 * Canonical check: is this order pending payment?
 *
 * An order is pending if it has NOT reached a final state.
 * Unknown/legacy statuses default to pending (safe for MVP).
 */
export function isOrderPendingPayment(status: string | null | undefined): boolean {
  if (!status) return true;
  return !(FINAL_STATUSES as readonly string[]).includes(status);
}
