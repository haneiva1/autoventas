import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Admin client with service role key - use for all server-side operations
export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
