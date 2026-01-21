-- Migration: Agent V2 Persistence and Auditing
-- Extends conversation_state with Agent V2 fields
-- Creates action_history table for audit trail

-- =============================================================================
-- Extend conversation_state table with Agent V2 fields
-- =============================================================================

-- Add fsm_state column (TEXT for FSM state tracking)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS fsm_state TEXT NOT NULL DEFAULT 'IDLE';

-- Add human_override column (BOOLEAN for manual takeover)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS human_override BOOLEAN NOT NULL DEFAULT false;

-- Add human_override_at column (TIMESTAMP for when override was activated)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS human_override_at TIMESTAMPTZ;

-- Add cart_json column (JSONB for shopping cart state)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS cart_json JSONB NOT NULL DEFAULT '{"items": [], "total": 0, "currency": "BOB"}';

-- Add last_llm_response column (JSONB for debugging/audit)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS last_llm_response JSONB;

-- Add pending_order_id column (UUID reference to orders table)
ALTER TABLE conversation_state
ADD COLUMN IF NOT EXISTS pending_order_id UUID REFERENCES orders(id);

-- Index for FSM state queries
CREATE INDEX IF NOT EXISTS idx_conversation_state_fsm_state
ON conversation_state(fsm_state);

-- Index for human_override queries
CREATE INDEX IF NOT EXISTS idx_conversation_state_human_override
ON conversation_state(human_override)
WHERE human_override = true;

-- =============================================================================
-- Create action_history table for audit trail
-- =============================================================================

CREATE TABLE IF NOT EXISTS action_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    action_type TEXT NOT NULL,
    action_payload JSONB NOT NULL DEFAULT '{}',
    validated BOOLEAN NOT NULL DEFAULT false,
    executed BOOLEAN NOT NULL DEFAULT false,
    fsm_state_before TEXT NOT NULL,
    fsm_state_after TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for conversation action history lookups
CREATE INDEX IF NOT EXISTS idx_action_history_conversation_id
ON action_history(conversation_id, created_at DESC);

-- Index for action type analysis
CREATE INDEX IF NOT EXISTS idx_action_history_action_type
ON action_history(action_type);

-- Index for executed actions
CREATE INDEX IF NOT EXISTS idx_action_history_executed
ON action_history(executed, created_at DESC)
WHERE executed = true;

-- Comment for documentation
COMMENT ON TABLE action_history IS 'Audit trail of all actions proposed and executed by Agent V2';
COMMENT ON COLUMN action_history.action_type IS 'Type of action (SHOW_CATALOG, ADD_TO_CART, CONFIRM_ORDER, etc.)';
COMMENT ON COLUMN action_history.action_payload IS 'Parameters passed to the action (product_id, quantity, etc.)';
COMMENT ON COLUMN action_history.validated IS 'Whether the action passed validation';
COMMENT ON COLUMN action_history.executed IS 'Whether the action was successfully executed';
COMMENT ON COLUMN action_history.fsm_state_before IS 'FSM state before action execution';
COMMENT ON COLUMN action_history.fsm_state_after IS 'FSM state after action execution';
