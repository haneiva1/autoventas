-- Migration: Extend payments table with additional fields
-- Safe: Only adds columns, does not modify existing data

-- Add proof_message_text to store the text accompanying the payment proof
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS proof_message_text TEXT;

-- Add conversation_id to link payment to conversation context
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);

-- Add tenant_id for consistency (payments currently lack it)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Add status field for payment workflow (pending, approved, rejected)
-- This is separate from vendor_decision which stores the actual decision
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Index for pending payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_pending
    ON payments(status, reported_at DESC)
    WHERE status = 'pending';

-- Comment for documentation
COMMENT ON COLUMN payments.proof_message_text IS 'Text message accompanying the payment proof';
COMMENT ON COLUMN payments.conversation_id IS 'Reference to the conversation where proof was sent';
COMMENT ON COLUMN payments.status IS 'Workflow status: pending, approved, rejected';
