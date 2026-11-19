// Supabase clients. `supabaseAdmin` uses the service role key and is server-only.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function supabaseBrowser() {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
}

export function supabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() must only be called on the server");
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}
