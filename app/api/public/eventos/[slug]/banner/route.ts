import { NextResponse, type NextRequest } from "next/server";
import { bannerSvg } from "@/lib/banner-art";
import { bannerUrl } from "@/lib/events";
import { db, unwrap } from "@/lib/supabase";
import { allow } from "@/lib/rate-limit";

// Banner público de um evento publicado, para o site da igreja.
// Se o evento tem banner enviado, redireciona para ele; senão, devolve a arte automática (a mesma da vitrine).
// Usa só nome, datas e tipo do evento: nenhum dado de inscrição.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (!allow(`public-banner:${ip}`, 120, 60_000)) return new NextResponse("Muitas requisições.", { status: 429 });
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return new NextResponse("Não encontrado.", { status: 404 });
  try {
    const e = unwrap(await db().from("events").select("id, name, starts_at, ends_at, kind, banner_path")
      .eq("slug", slug).eq("status", "published").maybeSingle()) as { id: number; name: string; starts_at: string; ends_at: string | null; kind: "paid" | "free"; banner_path: string | null } | null;
    if (!e) return new NextResponse("Não encontrado.", { status: 404 });
    const url = bannerUrl(e.banner_path);
    if (url) return NextResponse.redirect(url, 302);
    const svg = bannerSvg(e).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" ');
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("Banner público:", err);
    return new NextResponse("Indisponível.", { status: 503 });
  }
}
