# AutoVentas — WhatsApp AI Sales Agent

> AI-powered WhatsApp sales automation for SMBs. Handles customer inquiries, order creation, and payment verification — autonomously.

🚀 **[Live Demo](https://autoventas-web.vercel.app)**

---

## What It Does

AutoVentas replaces a human sales rep on WhatsApp. A customer messages your business, the AI understands their intent, creates an order, and notifies the merchant when payment proof arrives — all without manual intervention.

```
Customer: "Quiero 2 cajas de producto X"
AI Agent: "Claro! Son Bs 150 en total. ¿Cómo prefieres pagar?"
Customer: [sends transfer screenshot]
AI Agent: "¡Recibido! Tu pedido está confirmado 🎉"
Merchant: gets notified on dashboard → approves with one click
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js + Fastify + TypeScript |
| Frontend | Next.js 14 + React |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| AI | Google Gemini 2.5 Flash |
| Validation | Zod |
| Deploy | Vercel |

---

## Core Features

### AI Sales Agent
- Powered by Gemini 2.5 Flash with full conversation history context
- Detects intent: inquiry, order, payment proof, or general message
- Generates contextual replies in under 3 seconds
- Persists conversation state and action history across sessions

### Order Management
- Creates draft orders from natural conversation flow
- Status lifecycle: DRAFT → PENDING_PAYMENT → CONFIRMED → DELIVERED
- Denormalized product storage for query performance

### Payment Verification
- Detects payment proof messages via text keywords and image uploads
- Stores WhatsApp media references for image proofs
- Triggers instant merchant notification

### Merchant Dashboard
- Supabase Auth protected (email/magic link)
- Review payment proofs with full order context
- One-click approve or reject

---

## Architecture

POST /webhooks/whatsapp  (<500ms response guaranteed)
  → Zod validation + raw event storage
  → Message normalization → Supabase
  → Gemini agent (async) → reply draft
  → Merchant Dashboard → Approve/Reject → order state update

---

## Local Setup

git clone https://github.com/haneiva1/autoventas.git
cd autoventas && pnpm install
cp .env.example .env
pnpm supabase db push && pnpm dev

---

## Project Structure

apps/api    - Fastify API server
apps/web    - Next.js merchant dashboard
supabase/   - DB schema + migrations
PRD.md      - Product requirements
FLOW_SPEC.md - Conversation flow spec
THREAT_MODEL.md - Security threat model

---

## Performance

- Webhook response: < 500ms (p95)
- AI reply generation: < 3s

---

Built by Hans Aneiva — 19 y/o developer from La Paz, Bolivia.
Specializing in AI-powered automation for real business workflows.
GitHub: https://github.com/haneiva1 | haneivag@gmail.com