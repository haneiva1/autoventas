# PRD: AutoVentas ONE-COMPANY WhatsApp Sales Automation

## Overview

A WhatsApp-based sales automation system for a single company, enabling AI-assisted customer conversations, order management, and payment verification.

## Business Context

- **Target**: Single company (not multi-tenant SaaS)
- **Channel**: WhatsApp Business Cloud API
- **Currency**: Bolivianos (Bs)
- **Current State**: MVP with mocked WhatsApp integration (no number yet)

## User Personas

### 1. Customer (WhatsApp User)
- Sends messages to inquire about products
- Places orders via conversational flow
- Sends payment proof (text + image)
- Receives AI-generated responses

### 2. Merchant (Web Dashboard User)
- Reviews pending payment proofs
- Approves or rejects payments
- Views order status

## Core Features (MVP Scope)

### F1: Webhook Ingestion
- Receive WhatsApp webhook events via POST `/webhooks/whatsapp`
- Validate payload shape (Zod)
- Store raw event in `webhook_events`
- Extract and normalize message into `messages`
- Return 200 quickly (< 500ms)

### F2: AI Sales Agent
- Powered by Gemini 2.5 Flash
- Context: conversation history + product catalog
- Generates reply drafts stored in `messages` (direction: 'outbound', status: 'draft')
- Detects intent: inquiry, order_intent, payment_proof, other

### F3: Order Management
- Create draft orders from conversation context
- Store in `orders` with status: DRAFT → PENDING_PAYMENT → CONFIRMED → DELIVERED
- Products stored as `products_json` (denormalized for simplicity)

### F4: Payment Proof Flow
- Detect payment proof messages (text containing "pagué", "transferí", "comprobante", or image)
- Create `payments` record with:
  - `proof_media_id`: WhatsApp media ID (if image)
  - `proof_message_text`: accompanying text
  - `vendor_decision`: null (pending)
- Create merchant notification

### F5: Merchant Dashboard
- Supabase Auth login (email/password or magic link)
- List pending payment reviews
- Detail view showing:
  - Expected amount (Bs X)
  - Customer name/phone
  - Order items summary
  - Proof image (if available)
- Actions:
  - **Mark Paid**: Order → CONFIRMED, create thank-you message
  - **Not Paid**: Order stays DRAFT, create clarification message

## Definition of Done (Without WhatsApp Number)

1. POST mock webhook → API returns 200 in < 500ms
2. Raw + normalized message stored in Supabase
3. AI reply draft generated and stored
4. Payment proof → PaymentReview record created + notification stored
5. Merchant UI lists PaymentReviews with detail page
6. Mark Paid → Order CONFIRMED
7. Not Paid → clarification message queued

## Non-Goals (Explicitly Out of Scope)

- Real WhatsApp Cloud API integration (number registration, actual sending)
- Multi-tenancy / SaaS onboarding
- Advanced BI/analytics
- n8n or external workflow tools
- Media download/processing (just store media_id reference)
- Complex inventory management

## Technical Stack

| Component | Technology |
|-----------|------------|
| API | Node.js + Fastify + TypeScript |
| Web | Next.js 14 + React |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| AI | Google Gemini 2.5 Flash |
| Validation | Zod |

## Success Metrics

- Webhook response time < 500ms (p95)
- AI reply generation < 3s
- Payment review to decision < 24h (operational goal)
