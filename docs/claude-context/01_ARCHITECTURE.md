# Arquitectura Real del Sistema

## VPS
Proveedor: Hetzner
OS: Ubuntu

## Backend
Ruta real:
apps/api

Runtime real:
systemd ejecuta → node dist/server.js

⚠️ IMPORTANTE:
- Solo dist/ corre en producción
- Nunca editar dist manualmente
- Cambios requieren:
    pnpm build
    systemctl restart autoventas-api

## Base de datos
Supabase (Postgres)

Tabla fuente de verdad:
orders

Tabla auxiliar:
payments (no es fuente primaria)

Tabla de estado conversacional:
conversation_state

## Dashboard
Repo separado (apps/web)
Deployado en Vercel
Lee exclusivamente desde orders

