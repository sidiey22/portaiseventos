import { NextResponse, type NextRequest } from "next/server";
import { availability, bannerUrl, type EventFull } from "@/lib/events";
import { db, unwrap } from "@/lib/supabase";
import { allow } from "@/lib/rate-limit";
import { allowedOrigin, toPublic, type PublicEvent } from "@/lib/public-events";

// Vitrine pública e SOMENTE LEITURA dos eventos, para o site da igreja.
// Só eventos publicados e que ainda não terminaram; campos escolhidos em lib/public-events.ts.

export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
const g = globalThis as unknown as { __pePublic?: { at: number; body: { eventos: PublicEvent[]; atualizado_em: string } } };

function headers(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Cache-Control": "public, max-age=60, s-maxage=60",
    "Vary": "Origin",
    "X-Robots-Tag": "noindex",
  };
  const ok = allowedOrigin(origin);
  if (ok) {
    h["Access-Control-Allow-Origin"] = ok;
    h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

async function load() {
  const nowIso = new Date().toISOString();
  const rows = unwrap(await db().from("events")
    .select("id, slug, name, summary, place_name, starts_at, ends_at, kind, capacity, status, banner_path, lots(*), age_bands(*)")
    .eq("status", "published").order("starts_at")) as unknown as EventFull[];
  const list = rows.filter((e) => (e.ends_at ?? e.starts_at) > nowIso);
  const base = process.env.PUBLIC_URL || "https://portaiseventos.com";
  const eventos = await Promise.all(list.map(async (e) => {
    const av = await availability(e);
    return toPublic(e, { seatsLeft: av.seatsLeft, lotPrice: av.lot?.price_cents ?? null, salesOpen: av.salesOpen }, base, bannerUrl(e.banner_path) ?? `${base.replace(/\/$/, "")}/api/public/eventos/${encodeURIComponent(e.slug)}/banner`);
  }));
  return { eventos, atualizado_em: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (!allow(`public-eventos:${ip}`, 60, 60_000)) {
    return NextResponse.json({ erro: "Muitas requisições. Tente de novo em instantes." }, { status: 429, headers: headers(origin) });
  }
  try {
    const cached = g.__pePublic;
    if (!cached || Date.now() - cached.at > CACHE_MS) g.__pePublic = { at: Date.now(), body: await load() };
    return NextResponse.json(g.__pePublic!.body, { headers: headers(origin) });
  } catch (e) {
    console.error("Vitrine pública de eventos:", e);
    return NextResponse.json({ erro: "Eventos indisponíveis no momento." }, { status: 503, headers: headers(origin) });
  }
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: headers(req.headers.get("origin")) });
}

// Qualquer outro método (POST, PUT, DELETE...) não existe aqui: o Next responde 405 sozinho.
