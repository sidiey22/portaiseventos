"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEvent } from "@/lib/events";
import { placeOrder, quote, type ComboPick } from "@/lib/orders";
import { emailTickets } from "@/lib/notify";
import { allow, clientIp } from "@/lib/rate-limit";
import { validateOrder, type Buyer, type FieldErrors, type Person } from "@/lib/validation";
import type { Quote } from "@/lib/types";

export type CheckoutInput = { eventId: number; sessionId: number | null; people: Person[]; buyer: Buyer; combos: ComboPick[]; coupon: string };
export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string; field?: string };

function cleanCombos(c: ComboPick[]): ComboPick[] {
  return (Array.isArray(c) ? c : []).map((x) => ({ combo_id: Number(x.combo_id), quantity: Math.max(0, Math.min(10, Math.floor(Number(x.quantity) || 0))) }))
    .filter((x) => Number.isInteger(x.combo_id) && x.quantity > 0);
}

/** Resumo de preço calculado pelo banco (mesma conta da compra). Datas inválidas são ignoradas no resumo. */
export async function quoteAction(eventId: number, births: string[], combos: ComboPick[], coupon: string): Promise<QuoteResult> {
  if (!allow(`q:${await clientIp()}`, 120, 60_000)) return { ok: false, error: "Muitas consultas seguidas. Aguarde um instante." };
  const people = births.slice(0, 20).map((b) => ({ birth_date: /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : "1990-01-01" }));
  if (!people.length) return { ok: false, error: "Escolha pelo menos um ingresso." };
  return quote(Number(eventId), people, cleanCombos(combos), String(coupon || "").slice(0, 30));
}

export async function placeOrderAction(input: CheckoutInput): Promise<{ ok: false; errors?: FieldErrors; message: string }> {
  const ip = await clientIp();
  if (!allow(`o:${ip}`, 8, 10 * 60_000)) return { ok: false, message: "Muitas tentativas de compra seguidas. Aguarde alguns minutos." };
  const e = await getEvent(Number(input.eventId));
  if (!e || e.status !== "published") return { ok: false, message: "As inscrições para este evento não estão abertas." };
  const people = (Array.isArray(input.people) ? input.people : []).slice(0, 21).map((p) => ({
    name: String(p?.name ?? ""), gender: String(p?.gender ?? ""), birth_date: String(p?.birth_date ?? ""), answers: (p?.answers && typeof p.answers === "object") ? p.answers : {},
  }));
  const v = validateOrder({ name: String(input.buyer?.name ?? ""), email: String(input.buyer?.email ?? ""), phone: String(input.buyer?.phone ?? ""), cpf: String(input.buyer?.cpf ?? ""), adult: Boolean(input.buyer?.adult) }, people, e.questions);
  if (!v.ok) return { ok: false, errors: v.errors, message: "Confira os campos marcados." };
  if (e.sessions.length && !e.sessions.some((s) => s.id === Number(input.sessionId))) return { ok: false, errors: { session: "Escolha uma sessão." }, message: "Escolha uma sessão." };
  const r = await placeOrder(e.id, e.sessions.length ? Number(input.sessionId) : null, v.buyer, v.people, cleanCombos(input.combos), String(input.coupon || "").slice(0, 30));
  if (!r.ok) return { ok: false, errors: r.field ? { coupon: r.error } : undefined, message: r.error };

  // Guarda o código da compra neste navegador, para a página "Meus ingressos".
  const store = await cookies();
  const mine = (store.get("pe_compras")?.value ?? "").split(".").filter(Boolean);
  store.set("pe_compras", [r.order.code, ...mine.filter((c) => c !== r.order.code)].slice(0, 20).join("."), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  if (r.order.status === "confirmed") await emailTickets(r.order.id).catch((err) => console.error("Falha ao enviar ingressos:", err));
  redirect(`/compra/${r.order.code}`);
}
