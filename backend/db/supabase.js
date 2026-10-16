import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = config.supabaseUrl
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function requireDatabase() {
  if (!supabase) {
    throw new Error(
      "Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return supabase;
}
