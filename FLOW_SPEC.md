# Flow Specification: AutoVentas Sales Automation

## State Machine: Conversation State

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONVERSATION STATES                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐     message      ┌──────────────┐                   │
│   │   IDLE   │ ───────────────► │   GREETING   │                   │
│   └──────────┘                  └──────┬───────┘                   │
│        ▲                               │                            │
│        │                               │ product inquiry            │
│        │ timeout (24h)                 ▼                            │
│        │                        ┌──────────────┐                   │
│        │                        │  BROWSING    │◄─────┐            │
│        │                        └──────┬───────┘      │            │
│        │                               │              │ more items  │
│        │                               │ add to cart  │            │
│        │                               ▼              │            │
│        │                        ┌──────────────┐      │            │
│        │                        │   ORDERING   │──────┘            │
│        │                        └──────┬───────┘                   │
│        │                               │                            │
│        │                               │ confirm order              │
│        │                               ▼                            │
│        │                        ┌──────────────────┐               │
│        │                        │ PENDING_PAYMENT  │               │
│        │                        └──────┬───────────┘               │
│        │                               │                            │
│        │                               │ payment proof received     │
│        │                               ▼                            │
│        │                        ┌──────────────────┐               │
│        │                        │ AWAITING_REVIEW  │               │
│        │                        └──────┬───────────┘               │
│        │                               │                            │
│        │               ┌───────────────┼───────────────┐           │
│        │               │               │               │           │
│        │          mark_paid       not_paid        timeout          │
│        │               │               │               │           │
│        │               ▼               ▼               │           │
│        │        ┌──────────┐    ┌───────────┐         │           │
│        │        │CONFIRMED │    │ CLARIFY   │─────────┘           │
│        │        └──────────┘    └───────────┘                      │
│        │                               │                            │
│        └───────────────────────────────┘                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## State Machine: Order Status

```
┌─────────────────────────────────────────────────────────┐
│                     ORDER STATUS                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────┐    confirm    ┌─────────────────┐        │
│   │  DRAFT  │ ────────────► │ PENDING_PAYMENT │        │
│   └─────────┘               └────────┬────────┘        │
│        ▲                             │                  │
│        │                             │ mark_paid        │
│        │ not_paid                    ▼                  │
│        │                      ┌───────────┐            │
│        └──────────────────────│ CONFIRMED │            │
│                               └─────┬─────┘            │
│                                     │                   │
│                                     │ ship              │
│                                     ▼                   │
│                               ┌───────────┐            │
│                               │ DELIVERED │            │
│                               └───────────┘            │
│                                                         │
│   (CANCELLED can occur from any state except DELIVERED) │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Webhook Processing Flow

```
POST /webhooks/whatsapp
         │
         ▼
┌─────────────────────┐
│ 1. Validate payload │ ──── invalid ───► 400 Bad Request
│    (Zod schema)     │
└─────────┬───────────┘
          │ valid
          ▼
┌─────────────────────┐
│ 2. Check dedupe_key │ ──── duplicate ─► 200 OK (idempotent)
│    in webhook_events│
└─────────┬───────────┘
          │ new
          ▼
┌─────────────────────┐
│ 3. Store raw event  │
│    in webhook_events│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. Return 200 OK    │ ◄─── Response sent here (fast path)
└─────────┬───────────┘
          │
          ▼ (async processing)
┌─────────────────────┐
│ 5. Find/create      │
│    contact          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 6. Find/create      │
│    conversation     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 7. Store normalized │
│    message          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 8. Detect intent    │
│    (payment_proof?) │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │           │
payment_proof  other
    │           │
    ▼           ▼
┌────────┐  ┌────────────┐
│Create  │  │ Call Gemini│
│Payment │  │ for reply  │
│Review  │  └─────┬──────┘
└────┬───┘        │
     │            ▼
     │      ┌────────────┐
     │      │Store draft │
     │      │message     │
     │      └────────────┘
     │
     ▼
┌─────────────────────┐
│ 9. Create merchant  │
│    notification     │
└─────────────────────┘
```

## Payment Review Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      MERCHANT DASHBOARD                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Payment Review List                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Customer     │ Amount    │ Time      │ Status           │   │
│  ├──────────────┼───────────┼───────────┼──────────────────┤   │
│  │ Juan Pérez   │ Bs 150.00 │ 2 min ago │ ⏳ Pending       │   │
│  │ María García │ Bs 85.50  │ 15 min    │ ⏳ Pending       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Click on row ───────────────────────────────────────────────► │
│                                                                 │
│  Payment Detail View                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  Expected: Bs 150.00 from Juan Pérez (+591 7xxxxxxx)   │   │
│  │                                                         │   │
│  │  Order Items:                                           │   │
│  │  • 2x Producto A - Bs 50.00                            │   │
│  │  • 1x Producto B - Bs 50.00                            │   │
│  │                                                         │   │
│  │  Customer Message:                                      │   │
│  │  "Ya pagué, aquí está el comprobante"                  │   │
│  │                                                         │   │
│  │  [Proof Image Placeholder]                              │   │
│  │                                                         │   │
│  │  ┌────────────┐    ┌─────────────┐                     │   │
│  │  │ ✓ Mark Paid│    │ ✗ Not Paid │                     │   │
│  │  └─────┬──────┘    └──────┬──────┘                     │   │
│  │        │                  │                             │   │
│  └────────┼──────────────────┼─────────────────────────────┘   │
│           │                  │                                  │
│           ▼                  ▼                                  │
│   ┌───────────────┐  ┌────────────────────────────┐            │
│   │Order→CONFIRMED│  │Order stays DRAFT           │            │
│   │Payment→APPROVED│ │Payment→REJECTED            │            │
│   │Send thank you │  │Send "please clarify" msg   │            │
│   └───────────────┘  └────────────────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Edge Cases

### E1: Duplicate Webhook
- **Trigger**: WhatsApp retries webhook delivery
- **Detection**: `dedupe_key` matches existing `webhook_events` record
- **Handling**: Return 200 OK, skip processing

### E2: Customer Sends Multiple Payment Proofs
- **Trigger**: Customer sends proof before merchant reviews previous
- **Handling**: Create new `payments` record, both appear in review queue

### E3: Message Without Active Order
- **Trigger**: Payment proof received but no PENDING_PAYMENT order
- **Handling**: Create payment record anyway, flag for manual review

### E4: Merchant Takes No Action
- **Trigger**: Payment sits in queue > 24h
- **Handling**: (Future) Auto-reminder to merchant, customer notification

### E5: AI Generation Fails
- **Trigger**: Gemini API error or timeout
- **Handling**: Log error, store fallback message: "Un momento, te atenderemos pronto."

### E6: Unknown Message Type
- **Trigger**: WhatsApp sends unsupported message type (sticker, location, etc.)
- **Handling**: Store raw, skip AI processing, log for analysis

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/whatsapp` | Receive WhatsApp events |
| GET | `/webhooks/whatsapp` | Webhook verification (challenge) |
| GET | `/api/payments/pending` | List pending payment reviews |
| GET | `/api/payments/:id` | Payment review detail |
| POST | `/api/payments/:id/approve` | Mark as paid |
| POST | `/api/payments/:id/reject` | Mark as not paid |
| GET | `/api/orders/:id` | Order detail |

## Database Queries (Key Operations)

### Find or Create Contact
```sql
INSERT INTO contacts (id, tenant_id, wa_phone, name, tags, metadata, created_at)
VALUES (gen_random_uuid(), $1, $2, $3, '{}', '{}', now())
ON CONFLICT (tenant_id, wa_phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name)
RETURNING *;
```

### Get Conversation History for AI Context
```sql
SELECT direction, body, created_at
FROM messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 20;
```

### Pending Payment Reviews
```sql
SELECT p.*, o.customer_name, o.customer_phone, o.products_json, o.total_amount
FROM payments p
JOIN orders o ON p.order_id = o.id
WHERE p.vendor_decision IS NULL
ORDER BY p.reported_at DESC;
```
