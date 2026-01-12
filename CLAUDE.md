# CLAUDE.md - Repository Operating Manual

## Project Overview

AutoVentas ONE-COMPANY is a WhatsApp sales automation MVP for a single company. It receives WhatsApp messages, generates AI responses using Gemini, and provides a merchant dashboard for payment verification.

## Architecture

```
autoventas-onecompany/
├── apps/
│   ├── api/          # Fastify + TypeScript API server
│   └── web/          # Next.js merchant dashboard
├── supabase/
│   └── migrations/   # SQL migration files
├── scripts/          # Mock scripts for testing
├── docs/             # Runbook and additional docs
└── packages/         # Shared packages (future)
```

## Key Technologies

- **API**: Fastify 4.x, TypeScript, Zod validation
- **Web**: Next.js 14, React, Tailwind CSS
- **Database**: Supabase Postgres
- **AI**: Google Gemini 2.5 Flash
- **Auth**: Supabase Auth

## Golden Commands

### Development

```bash
# Install all dependencies
pnpm install

# Start API server (port 3001)
pnpm dev:api

# Start web dashboard (port 3000)
pnpm dev:web

# Run both in parallel
pnpm dev:api & pnpm dev:web
```

### Testing with Mocks

```bash
# Send a mock incoming WhatsApp message
pnpm --filter scripts mock:message

# Send a mock payment proof
pnpm --filter scripts mock:payment
```

### Type Checking & Linting

```bash
# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build all packages
pnpm build
```

### Database

```bash
# Apply migrations (requires supabase CLI and linked project)
supabase db push

# Generate TypeScript types from schema
supabase gen types typescript --local > packages/types/database.ts
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side key (never expose) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same as SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side anon key |
| `GEMINI_API_KEY` | Yes | Google AI API key |
| `TENANT_ID` | Yes | Single tenant UUID |
| `API_PORT` | No | Default: 3001 |

## Database Schema (Key Tables)

### Existing Tables (DO NOT DROP)
- `tenants` - Single tenant for ONE-COMPANY
- `contacts` - Customer records (wa_phone, name)
- `conversations` - Conversation threads
- `messages` - All messages (inbound/outbound, raw JSON)
- `orders` - Order records with status
- `payments` - Payment proofs with vendor_decision
- `webhook_events` - Raw webhook storage with dedupe
- `conversation_state` - FSM state tracking
- `app_config` - Key-value configuration

### Added Tables
- `vendi_products` - Product catalog
- `vendi_merchant_notifications` - Notification log

## Code Conventions

### API Route Structure
```typescript
// src/routes/webhooks/whatsapp.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const WhatsAppWebhookSchema = z.object({...});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', {
    schema: { body: WhatsAppWebhookSchema }
  }, async (request, reply) => {
    // Handler
  });
};
```

### Error Handling
- Use Fastify's built-in error handling
- Log errors with Pino (redact PII)
- Return appropriate HTTP status codes

### Supabase Queries
- Always use `supabaseAdmin` (service role) for writes
- Use parameterized queries (automatic with supabase-js)
- Check for errors: `if (error) throw error`

## Debugging

### Check Webhook Events
```sql
SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 10;
```

### Check Message Flow
```sql
SELECT m.*, c.wa_phone
FROM messages m
JOIN conversations conv ON m.conversation_id = conv.id
JOIN contacts c ON conv.contact_id = c.id
ORDER BY m.created_at DESC LIMIT 20;
```

### Check Pending Payments
```sql
SELECT p.*, o.customer_name, o.total_amount
FROM payments p
JOIN orders o ON p.order_id = o.id
WHERE p.vendor_decision IS NULL;
```

## Common Issues

### "pnpm not found"
```bash
npm install -g pnpm
```

### "Cannot connect to Supabase"
- Check SUPABASE_URL and keys in .env
- Ensure project is not paused

### "Gemini API error"
- Check GEMINI_API_KEY is valid
- Check quota limits on Google Cloud console

## Security Notes

- Never commit `.env` files
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server code
- Validate all webhook payloads with Zod
- Rate limiting is enabled on webhook endpoint

## File Ownership

When making changes:
- `/apps/api/src/routes/` - API endpoint handlers
- `/apps/api/src/services/` - Business logic
- `/apps/web/app/` - Next.js pages and components
- `/supabase/migrations/` - Database changes (append-only)
