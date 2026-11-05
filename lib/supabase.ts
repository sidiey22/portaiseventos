import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Só roda no servidor. O navegador não recebe nenhuma chave do Supabase.

const g = globalThis as unknown as { __peAdmin?: SupabaseClient };

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não está configurado.`);
  return v;
}

/** Cliente com a chave SECRETA: acesso total ao banco. Use só depois de conferir a permissão de quem está agindo. */
export function db(): SupabaseClient {
  if (!g.__peAdmin) {
    g.__peAdmin = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__peAdmin;
}

/** Cliente de login da equipe (Supabase Auth), com a sessão guardada em cookie httpOnly. */
export async function authClient(): Promise<SupabaseClient> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, { ...c.options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
        } catch {
          // Em componentes de servidor não dá para gravar cookie; o proxy renova a sessão.
        }
      },
    },
  });
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Devolve os dados ou lança erro. */
export function unwrap<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
