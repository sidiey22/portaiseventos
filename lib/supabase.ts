import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const g = globalThis as unknown as { __portaisSupabase?: SupabaseClient };

/**
 * Cliente do Supabase com a chave SECRETA. Só roda no servidor (nunca importe isto em componente de cliente).
 * As tabelas têm RLS ligado e nenhuma política: só esta chave acessa os dados.
 */
export function sb(): SupabaseClient {
  if (!g.__portaisSupabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configurados.");
    g.__portaisSupabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__portaisSupabase;
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Devolve os dados ou lança erro (use quando falhar significa um problema de verdade). */
export function unwrap<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
