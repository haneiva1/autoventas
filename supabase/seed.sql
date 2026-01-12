-- Seed data for autoventas ONE-COMPANY
-- Run this after migrations to set up initial data

-- Insert the single tenant (ONE-COMPANY)
INSERT INTO tenants (id, name, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'AutoVentas OneCompany', now())
ON CONFLICT (id) DO NOTHING;

-- Insert sample products
INSERT INTO vendi_products (tenant_id, sku, name, description, price, currency, category, is_active)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'PROD-001', 'Producto Demo A', 'Producto de demostración A', 50.00, 'BOB', 'general', true),
    ('00000000-0000-0000-0000-000000000001', 'PROD-002', 'Producto Demo B', 'Producto de demostración B', 75.00, 'BOB', 'general', true),
    ('00000000-0000-0000-0000-000000000001', 'PROD-003', 'Producto Demo C', 'Producto de demostración C', 100.00, 'BOB', 'premium', true)
ON CONFLICT DO NOTHING;

-- Insert app config for AI system prompt
INSERT INTO app_config (key, value, updated_at)
VALUES (
    'ai_system_prompt',
    'Eres un asistente de ventas amable y profesional para AutoVentas. Ayudas a los clientes a conocer productos, realizar pedidos y resolver dudas. Responde siempre en español. Sé conciso pero cordial.',
    now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Insert app config for business info
INSERT INTO app_config (key, value, updated_at)
VALUES (
    'business_info',
    '{"name": "AutoVentas", "currency": "BOB", "timezone": "America/La_Paz"}',
    now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
