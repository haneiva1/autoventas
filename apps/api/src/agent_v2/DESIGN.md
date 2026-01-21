# Agent V2 - Documento de Arquitectura

**Version**: 1.1
**Fase**: 1 - Diseno Conceptual
**Feature Flag**: `AGENT_V2_ENABLED`

---

## 1. Principios de Diseno

| Principio | Descripcion |
|-----------|-------------|
| **Backend Deterministico** | Precios, stock, validaciones y transiciones de estado son controlados exclusivamente por el backend |
| **LLM Propone, Backend Valida** | El LLM sugiere acciones estructuradas; el backend acepta, rechaza o modifica antes de ejecutar |
| **Supabase como Memoria Viva** | Todo estado de conversacion persiste en base de datos, no en memoria |
| **Human Override Absoluto** | Cuando un humano toma control, el agente se silencia completamente |
| **Aislamiento Total** | Agent V2 vive en su propio directorio, no modifica codigo existente |
| **Coexistencia** | Si `AGENT_V2_ENABLED=false`, el sistema V1 opera sin cambios |

---

## 2. Garantias del Sistema

- **Precios inmutables**: El LLM nunca puede alterar precios; solo referencia el catalogo
- **Sin descuentos**: No existe logica de descuentos; el LLM no puede prometerlos
- **Pagos solo por merchant**: Aprobar/rechazar pagos es accion exclusiva de humanos
- **Auditoria completa**: Cada accion propuesta, validada y ejecutada queda registrada
- **Rollback a V1**: Desactivar el feature flag restaura comportamiento original instantaneamente

---

## 3. Estados de Conversacion (7 estados)

| Estado | Descripcion |
|--------|-------------|
| `IDLE` | Sin conversacion activa o sesion expirada |
| `BROWSING` | Explorando catalogo, carrito vacio |
| `CART_OPEN` | Carrito con items, puede modificar |
| `CHECKOUT` | Revisando pedido, esperando confirmacion |
| `AWAITING_PAYMENT` | Pedido confirmado, esperando comprobante |
| `COMPLETED` | Pedido finalizado exitosamente |
| `HUMAN_TAKEOVER` | Control transferido a humano |

### Transiciones Validas

```
IDLE ---------------> BROWSING ---------------> CART_OPEN ---------------> CHECKOUT
  ^                      ^                          |                         |
  |                      |                          |                         |
  |                      +--------------------------+                         |
  |                           (clear cart)                                    |
  |                                                                           v
  +<-----------------------------------------------------------------AWAITING_PAYMENT
  |                          (cancel/timeout)                                 |
  |                                                                           |
  |                                                                           v
  +<----------------------------------------------------------------------COMPLETED
  |                           (nueva sesion)
  |
  |               (ESCALATE desde cualquier estado)
  +<-----------------------------------------------------------------HUMAN_TAKEOVER
                     (solo humano libera)
```

---

## 4. Eventos (no son estados)

Los eventos son sucesos que disparan logica sin cambiar el estado directamente.

| Evento | Descripcion |
|--------|-------------|
| `GREETING_RECEIVED` | Saludo detectado (hola, buenos dias) |
| `PAYMENT_PROOF_RECEIVED` | Imagen o keywords de pago detectados |
| `PAYMENT_APPROVED` | Merchant aprobo el pago |
| `PAYMENT_REJECTED` | Merchant rechazo el pago |
| `ESCALATION_REQUESTED` | Cliente pidio hablar con humano |
| `SESSION_TIMEOUT` | Inactividad prolongada |
| `ORDER_CANCELLED` | Cancelacion explicita |

---

## 5. Human Override - Bypass Total

### Regla

Cuando `human_override = true`:
- El agente **NO procesa** mensajes entrantes
- El agente **NO genera** respuestas
- Los mensajes se almacenan para que el merchant los vea
- Solo un humano puede responder

### Activacion

| Trigger | Resultado |
|---------|-----------|
| Accion `ESCALATE` ejecutada | Override activado automaticamente |
| Cliente dice "quiero hablar con alguien" | Override activado |
| Merchant activa desde dashboard | Override activado |

### Desactivacion

| Trigger | Resultado |
|---------|-----------|
| Merchant desactiva desde dashboard | Override desactivado |
| Timeout configurable sin actividad | Override desactivado |

---

## 6. Acciones Permitidas

### Catalogo

| Accion | Descripcion |
|--------|-------------|
| `SHOW_CATALOG` | Mostrar catalogo completo |
| `SHOW_PRODUCT` | Mostrar detalle de un producto |

### Carrito

| Accion | Descripcion |
|--------|-------------|
| `ADD_TO_CART` | Agregar producto con cantidad |
| `UPDATE_QUANTITY` | Modificar cantidad de item existente |
| `REMOVE_ITEM` | Eliminar item del carrito |
| `CLEAR_CART` | Vaciar carrito completo |

### Pedido

| Accion | Descripcion |
|--------|-------------|
| `REVIEW_ORDER` | Mostrar resumen para confirmar |
| `CONFIRM_ORDER` | Confirmar pedido, mostrar datos de pago |
| `CANCEL_ORDER` | Cancelar pedido en progreso |

### Conversacion

| Accion | Descripcion |
|--------|-------------|
| `REPLY` | Respuesta conversacional |
| `CLARIFY` | Pedir aclaracion |
| `ESCALATE` | Transferir a humano |

---

## 7. Acciones Prohibidas

| Accion | Razon |
|--------|-------|
| `MODIFY_PRICE` | Precios son inmutables |
| `APPLY_DISCOUNT` | No existe logica de descuentos |
| `APPROVE_PAYMENT` | Exclusivo de merchant |
| `REJECT_PAYMENT` | Exclusivo de merchant |
| `DISABLE_OVERRIDE` | Exclusivo de merchant/sistema |

---

## 8. Matriz de Validacion

| Accion | Estados Validos | Validaciones |
|--------|-----------------|--------------|
| `SHOW_CATALOG` | todos | ninguna |
| `SHOW_PRODUCT` | todos | producto existe y activo |
| `ADD_TO_CART` | IDLE, BROWSING, CART_OPEN | producto existe, cantidad 1-100 |
| `UPDATE_QUANTITY` | CART_OPEN | item en carrito, cantidad 1-100 |
| `REMOVE_ITEM` | CART_OPEN | item existe en carrito |
| `CLEAR_CART` | CART_OPEN | carrito no vacio |
| `REVIEW_ORDER` | CART_OPEN | carrito no vacio |
| `CONFIRM_ORDER` | CHECKOUT | carrito no vacio |
| `CANCEL_ORDER` | CART_OPEN, CHECKOUT, AWAITING_PAYMENT | ninguna |
| `REPLY` | todos | ninguna |
| `CLARIFY` | todos | ninguna |
| `ESCALATE` | todos | ninguna, activa human_override |

---

## 9. Contrato JSON del LLM

### Contexto de Entrada (lo que recibe el LLM)

```json
{
  "current_state": "CART_OPEN",
  "detected_events": ["GREETING_RECEIVED"],
  "cart": {
    "items": [
      {
        "product_id": "prod_001",
        "name": "Maracuya",
        "quantity": 2,
        "unit_price": 30,
        "subtotal": 60
      }
    ],
    "total": 60,
    "currency": "BOB"
  },
  "customer_message": "agregame 3 de matcha y dime el total",
  "recent_history": [
    { "role": "customer", "text": "quiero 2 de maracuya" },
    { "role": "assistant", "text": "Agregue 2 Maracuya (60 Bs). Algo mas?" }
  ],
  "product_catalog": [
    { "id": "prod_001", "name": "Maracuya", "price": 30, "active": true },
    { "id": "prod_002", "name": "Matcha", "price": 29, "active": true }
  ]
}
```

### Respuesta del LLM (lo que devuelve)

```json
{
  "reasoning": "Cliente quiere agregar matcha y ver total. Dos acciones.",
  "proposed_actions": [
    {
      "type": "ADD_TO_CART",
      "params": {
        "product_id": "prod_002",
        "product_name": "Matcha",
        "quantity": 3
      }
    },
    {
      "type": "REVIEW_ORDER",
      "params": {}
    }
  ],
  "response_text": "Agregue 3 Matcha. Tu pedido:\n- 2 Maracuya: 60 Bs\n- 3 Matcha: 87 Bs\nTotal: 147 Bs\n\nConfirmamos?",
  "suggested_state": "CHECKOUT"
}
```

### Schema Formal de Respuesta

```json
{
  "type": "object",
  "required": ["proposed_actions", "response_text"],
  "properties": {
    "reasoning": {
      "type": "string",
      "description": "Razonamiento interno (no se muestra al cliente)"
    },
    "proposed_actions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "SHOW_CATALOG", "SHOW_PRODUCT",
              "ADD_TO_CART", "UPDATE_QUANTITY", "REMOVE_ITEM", "CLEAR_CART",
              "REVIEW_ORDER", "CONFIRM_ORDER", "CANCEL_ORDER",
              "REPLY", "CLARIFY", "ESCALATE"
            ]
          },
          "params": {
            "type": "object",
            "properties": {
              "product_id": { "type": "string" },
              "product_name": { "type": "string" },
              "quantity": { "type": "integer", "minimum": 1, "maximum": 100 },
              "reason": { "type": "string" }
            }
          }
        }
      }
    },
    "response_text": {
      "type": "string",
      "maxLength": 500
    },
    "suggested_state": {
      "type": "string",
      "enum": ["IDLE", "BROWSING", "CART_OPEN", "CHECKOUT", "AWAITING_PAYMENT", "HUMAN_TAKEOVER"]
    }
  }
}
```

---

## 10. Flujo de Validacion

```
proposed_actions[]
       |
       v
  +-------------------------------------+
  |  POR CADA accion:                   |
  |  1. Tipo permitido?                 |
  |  2. Estado actual permite accion?   |
  |  3. Parametros validos?             |
  |  4. Reglas de negocio cumplidas?    |
  +-------------------------------------+
       |
       +-- Valida ----> Se agrega a valid_actions[]
       |
       +-- Invalida --> Se registra rechazo, se omite

valid_actions[] --> Ejecucion secuencial --> Nuevo estado --> Respuesta final
```

---

## 11. Persistencia

### Datos en `conversation_state`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `fsm_state` | TEXT | Estado actual (IDLE, BROWSING, etc.) |
| `human_override` | BOOLEAN | Si humano tiene control |
| `human_override_at` | TIMESTAMP | Cuando se activo override |
| `cart_json` | JSONB | Carrito actual |
| `pending_order_id` | UUID | Orden en progreso |
| `events_log` | JSONB | Historial de eventos |
| `last_llm_response` | JSONB | Ultima respuesta del LLM |

---

**Fin del documento de diseno FASE 1**
