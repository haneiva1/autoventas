# Flujo Real de Runtime

WhatsApp Webhook →
routes/webhooks.ts →
Bridge de pago (determinista) →
processWithRules →
LLM fallback →
Persistencia →
Respuesta WhatsApp

## Bridge determinista

Si mensaje contiene:
"ya pagué"
"ya pague"
"te pagué"
"pagué X Bs"

Entonces:
- NO usar LLM
- Crear order con status PAYMENT_PENDING
- Crear payment_review
- Responder confirmación

## Regla crítica
El bridge debe ejecutarse ANTES del LLM.

