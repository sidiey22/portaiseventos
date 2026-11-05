import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Renova a sessão da equipe (cookie httpOnly) a cada visita às páginas da equipe.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, { ...c.options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/equipe/:path*"] };
