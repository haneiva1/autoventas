-- Migration: Add vendi_products and vendi_merchant_notifications tables
-- Safe: Creates new tables, does not modify existing ones

-- Product catalog for the single company
CREATE TABLE IF NOT EXISTS vendi_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sku TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BOB',
    category TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for product lookups
CREATE INDEX IF NOT EXISTS idx_vendi_products_tenant_active
    ON vendi_products(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_vendi_products_name_search
    ON vendi_products USING gin(to_tsvector('spanish', name));

-- Merchant notifications log
CREATE TABLE IF NOT EXISTS vendi_merchant_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    notification_type TEXT NOT NULL, -- 'payment_proof', 'new_order', 'customer_inquiry'
    title TEXT NOT NULL,
    body TEXT,
    reference_type TEXT, -- 'payment', 'order', 'message'
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_vendi_notifications_unread
    ON vendi_merchant_notifications(tenant_id, is_read, created_at DESC)
    WHERE is_read = false;

-- Comment for documentation
COMMENT ON TABLE vendi_products IS 'Product catalog for autoventas ONE-COMPANY';
COMMENT ON TABLE vendi_merchant_notifications IS 'Notification log for merchant dashboard';
