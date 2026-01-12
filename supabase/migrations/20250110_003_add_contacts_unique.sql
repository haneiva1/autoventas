-- Migration: Add unique constraint on contacts for upsert operations
-- Safe: Creates constraint only if it doesn't exist

-- Check if constraint exists and create if not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contacts_tenant_phone_unique'
    ) THEN
        ALTER TABLE contacts
        ADD CONSTRAINT contacts_tenant_phone_unique
        UNIQUE (tenant_id, wa_phone);
    END IF;
END
$$;

-- Add index on messages for conversation history queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);

-- Add index on orders for customer lookup
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
    ON orders(customer_phone, created_at DESC);

-- Add index on orders for status filtering
CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status, updated_at DESC);
