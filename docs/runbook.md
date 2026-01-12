# Runbook: AutoVentas ONE-COMPANY

This document provides step-by-step instructions for local development and deployment.

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Supabase account with a project
- Google Cloud account with Gemini API enabled

## Local Development Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd autoventas-onecompany
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Get from Supabase Dashboard > Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Get from Google AI Studio: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your-gemini-api-key

# Fixed tenant ID (do not change unless you modify seed.sql)
TENANT_ID=00000000-0000-0000-0000-000000000001

# Optional
API_PORT=3001
```

### 3. Apply Database Migrations

Option A: Using Supabase CLI (recommended)

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

Option B: Manual SQL execution

1. Go to Supabase Dashboard > SQL Editor
2. Run each file in `supabase/migrations/` in order:
   - `20250110_001_add_vendi_tables.sql`
   - `20250110_002_extend_payments.sql`
   - `20250110_003_add_contacts_unique.sql`
3. Run `supabase/seed.sql` to create tenant and sample products

### 4. Create Merchant User

In Supabase Dashboard > Authentication > Users:

1. Click "Add User"
2. Enter email and password
3. Click "Create User"

This user can log into the merchant dashboard.

### 5. Start Development Servers

Terminal 1 - API:
```bash
pnpm dev:api
# Runs on http://localhost:3001
```

Terminal 2 - Web:
```bash
pnpm dev:web
# Runs on http://localhost:3000
```

### 6. Test with Mock Scripts

Ensure both servers are running, then:

```bash
# Test incoming message flow
pnpm --filter scripts mock:message

# Test payment proof flow
pnpm --filter scripts mock:payment
```

### 7. Access Dashboard

1. Open http://localhost:3000
2. Login with the merchant user credentials
3. View pending payments and approve/reject

## End-to-End Test Flow

1. **Start servers** (API + Web)

2. **Run mock:message**
   - Simulates customer sending "Hola, me gustaría ver los productos disponibles"
   - Verify: message stored in `messages` table
   - Verify: AI reply generated and stored

3. **Run mock:payment**
   - Creates test order if needed
   - Simulates customer sending payment proof image
   - Verify: `payments` record created with `status: pending`
   - Verify: `vendi_merchant_notifications` record created

4. **Open Dashboard**
   - Login at http://localhost:3000
   - See pending payment in list
   - Click to view detail

5. **Approve Payment**
   - Click "Marcar Pagado"
   - Verify: `payments.vendor_decision = 'approved'`
   - Verify: `orders.status = 'CONFIRMED'`
   - Verify: Thank you message stored in `messages`

6. **Or Reject Payment**
   - Click "No Pagado"
   - Verify: `payments.vendor_decision = 'rejected'`
   - Verify: `orders.status = 'DRAFT'`
   - Verify: Clarification message stored in `messages`

## Verification Queries

Check pending payments:
```sql
SELECT p.id, p.status, p.vendor_decision, o.customer_name, o.total_amount
FROM payments p
JOIN orders o ON p.order_id = o.id
WHERE p.vendor_decision IS NULL
ORDER BY p.reported_at DESC;
```

Check recent messages:
```sql
SELECT m.direction, m.body, m.created_at, c.wa_phone
FROM messages m
JOIN conversations conv ON m.conversation_id = conv.id
JOIN contacts c ON conv.contact_id = c.id
ORDER BY m.created_at DESC
LIMIT 20;
```

Check order status:
```sql
SELECT id, customer_name, status, total_amount, updated_at
FROM orders
ORDER BY updated_at DESC
LIMIT 10;
```

## Deployment

### Option 1: Railway/Render (Recommended for MVP)

1. Connect GitHub repository
2. Set environment variables
3. Deploy API as a service (port 3001)
4. Deploy Web as a service (Next.js)
5. Update CORS settings if needed

### Option 2: Vercel + Fly.io

**Web (Vercel):**
```bash
cd apps/web
vercel --prod
```

**API (Fly.io):**
```bash
cd apps/api
fly launch
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=...
fly deploy
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use production Supabase project (not dev)
- [ ] Enable RLS policies on all tables
- [ ] Configure rate limiting appropriately
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure CORS for production domains
- [ ] Set up webhook signature verification (WHATSAPP_APP_SECRET)
- [ ] Review log redaction settings

## Troubleshooting

### "Cannot connect to Supabase"
- Verify SUPABASE_URL format: `https://xxx.supabase.co`
- Check if project is paused (unpause in dashboard)
- Verify service role key is correct

### "Gemini API error"
- Verify API key at https://aistudio.google.com/app/apikey
- Check quota/billing in Google Cloud Console
- Try model `gemini-1.5-flash` if 2.0 unavailable

### "No AI reply generated"
- Check API logs for Gemini errors
- Verify GEMINI_API_KEY is set
- Check network connectivity to Google APIs

### "Payment not appearing in dashboard"
- Run mock:payment script
- Check `payments` table directly in Supabase
- Verify `vendor_decision IS NULL` filter

### "Auth not working"
- Ensure user exists in Supabase Auth
- Check NEXT_PUBLIC_SUPABASE_URL and ANON_KEY
- Clear cookies and try again

## Support

For issues, check:
1. API logs: `pnpm dev:api` output
2. Supabase logs: Dashboard > Logs
3. Browser console for web errors
