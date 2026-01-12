-- Migration: Add outbound_messages table for message queue
-- Safe: Creates new table, does not modify existing ones

-- Outbound message queue for WhatsApp and other channels
CREATE TABLE IF NOT EXISTS outbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    seller_id UUID NULL,
    conversation_id UUID NULL REFERENCES conversations(id),
    order_id UUID NULL REFERENCES orders(id),
    to_phone TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    message_type TEXT NOT NULL DEFAULT 'text',  -- 'text', 'image', 'template'
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'canceled'
    provider_message_id TEXT NULL,
    error TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    sent_at TIMESTAMPTZ NULL,
    failed_at TIMESTAMPTZ NULL
);

-- Index for pending message processing
CREATE INDEX IF NOT EXISTS idx_outbound_pending
    ON outbound_messages(status, created_at)
    WHERE status = 'pending';

-- Index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_outbound_to_phone
    ON outbound_messages(to_phone);

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_outbound_conversation
    ON outbound_messages(conversation_id)
    WHERE conversation_id IS NOT NULL;

-- Comment for documentation
COMMENT ON TABLE outbound_messages IS 'Queue for outbound WhatsApp messages - allows development without real WhatsApp number';
