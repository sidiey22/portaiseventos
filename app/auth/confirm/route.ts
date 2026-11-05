import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase";

// Link dos emails de convite e de troca de senha (template do Supabase com {{ .TokenHash }}).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const base = (process.env.PUBLIC_URL ?? url.origin).replace(/\/$/, "");
  if (tokenHash && (type === "invite" || type === "recovery" || type === "magiclink" || type === "email")) {
    const auth = await authClient();
    const { error } = await auth.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${base}/equipe/definir-senha`);
  }
  return NextResponse.redirect(`${base}/equipe/entrar?erro=${encodeURIComponent("O link expirou ou já foi usado. Peça um novo.")}`);
}
