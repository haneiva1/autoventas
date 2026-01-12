# Threat Model: AutoVentas ONE-COMPANY

## Overview

This document identifies security risks and mitigations for the WhatsApp sales automation MVP.

## Assets

| Asset | Sensitivity | Storage |
|-------|-------------|---------|
| Customer phone numbers | PII | `contacts.wa_phone`, `orders.customer_phone` |
| Customer names | PII | `contacts.name`, `orders.customer_name` |
| Order details | Business | `orders.products_json`, `orders.total_amount` |
| Payment proofs | Financial | `payments.proof_media_id` (reference only) |
| Webhook payloads | Operational | `webhook_events.payload` |
| Merchant credentials | Auth | Supabase Auth (hashed) |

## Threat Categories

### T1: Webhook Abuse

**Threat**: Attacker sends fake webhook events to pollute data or trigger unintended actions.

**Mitigations**:
- [ ] Rate limiting: 100 req/min per IP (implemented)
- [ ] Payload validation: Zod schema enforcement (implemented)
- [ ] Signature verification: Validate `X-Hub-Signature-256` header (placeholder, requires WHATSAPP_APP_SECRET)
- [ ] Dedupe key: Prevent replay attacks via `webhook_events.dedupe_key`

**Residual Risk**: Medium (until real signature verification enabled)

### T2: Injection Attacks

**Threat**: Malicious content in message body leads to SQL injection, XSS, or prompt injection.

**Mitigations**:
- Supabase client uses parameterized queries (SQL injection prevented)
- React escapes output by default (XSS in web UI prevented)
- AI prompts use structured templates with content in designated fields (prompt injection reduced)
- No `eval()` or dynamic code execution

**Residual Risk**: Low

### T3: Unauthorized Data Access

**Threat**: Attacker accesses customer data or orders without authorization.

**Mitigations**:
- Server-only writes use `SUPABASE_SERVICE_ROLE_KEY` (not exposed to client)
- Web UI uses `SUPABASE_ANON_KEY` with RLS policies
- RLS policies enforce tenant isolation (single tenant for MVP)
- Supabase Auth required for dashboard access

**Residual Risk**: Low

### T4: PII Exposure in Logs

**Threat**: Sensitive customer data logged and exposed via log aggregation.

**Mitigations**:
- Pino logger configured to redact: phone numbers, customer names
- Raw webhook payloads logged at DEBUG level only
- Production logs should use structured logging with field filtering

**Residual Risk**: Low (if log configuration followed)

### T5: AI Hallucination / Harmful Responses

**Threat**: AI generates incorrect product info, prices, or inappropriate content.

**Mitigations**:
- Responses stored as drafts (can be reviewed before sending in future)
- Product catalog passed as context (reduces hallucination)
- System prompt includes behavior boundaries
- Future: human review queue for edge cases

**Residual Risk**: Medium (inherent to LLM systems)

### T6: Denial of Service

**Threat**: Attacker floods API to exhaust resources or database connections.

**Mitigations**:
- Rate limiting at Fastify level
- Supabase connection pooling (PgBouncer)
- Webhook processing is async (AI calls don't block response)

**Residual Risk**: Low

## Security Controls Summary

| Control | Status | Notes |
|---------|--------|-------|
| Input validation (Zod) | Implemented | All endpoints |
| Rate limiting | Implemented | 100/min per IP |
| Webhook signature verification | Placeholder | Requires WHATSAPP_APP_SECRET |
| Parameterized queries | Automatic | Supabase JS client |
| RLS policies | Pending | Add for production |
| Log redaction | Implemented | Pino redact config |
| HTTPS only | Depends on deployment | Enforce at load balancer |
| Secrets management | .env | Use secrets manager for production |

## Incident Response

1. **Suspicious webhook activity**: Check `webhook_events` for unusual patterns, block IP if needed
2. **Data breach suspicion**: Rotate Supabase keys, audit `auth.users` and RLS policies
3. **AI misbehavior**: Check `messages` for problematic drafts, adjust system prompt

## Review Schedule

- Review threat model when adding new features
- Quarterly review of access patterns and RLS policies
- Update mitigations when WhatsApp production integration begins
