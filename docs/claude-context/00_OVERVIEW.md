# AutoVentas / Ruah Ventas – Overview

## Proyecto
Sistema de automatización de ventas por WhatsApp para micro-SMEs en Bolivia.
Cliente piloto: Chocolates Ruah.

## Canal
WhatsApp Cloud API (LIVE).

## Infraestructura
- VPS Hetzner Ubuntu
- Backend: Fastify (Node 20)
- Runtime ejecutado por systemd
- Base de datos: Supabase (Postgres)
- Dashboard separado (Next.js) deployado en Vercel

## Objetivo del MVP
- Mostrar catálogo completo
- Permitir agregar productos al carrito
- Mostrar total
- Enviar QR de pago
- Detectar mensaje "Ya pagué X Bs"
- Crear orden con status PAYMENT_PENDING
- Dashboard permite confirmación humana

## Estado actual
- WhatsApp inbound/outbound funciona
- QR endpoint funciona
- Tabla orders es fuente de verdad
- Bridge de pago parcialmente implementado
- LLM aún no está bajo contrato determinista completo

