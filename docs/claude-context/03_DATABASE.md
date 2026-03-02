# Base de Datos

## orders (fuente de verdad)

Campos relevantes:
- id (uuid)
- customer_phone
- customer_name
- status (text)
- products_json (jsonb)
- total_amount (numeric)
- currency
- created_at
- updated_at

Estados reales en producción:
- PAYMENT_PENDING
- PAID

PAID equivale funcionalmente a CONFIRMADO.

## conversation_state

Campos:
- wa_id
- current_state
- cart (jsonb)
- total_amount (numeric)

No modificar schema para MVP.

