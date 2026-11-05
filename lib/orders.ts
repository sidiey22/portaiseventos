import { db, unwrap } from "./supabase.ts";
import { friendlyError } from "./errors.ts";
import type { Order, Quote, Ticket } from "./types.ts";
import type { Buyer, Person } from "./validation.ts";

export type ComboPick = { combo_id: number; quantity: number };

/** Preço calculado pelo banco (a mesma conta usada na compra). */
export async function quote(eventId: number, people: { birth_date: string }[], combos: ComboPick[], coupon: string):
  Promise<{ ok: true; quote: Quote } | { ok: false; error: string; field?: "coupon" }> {
  const { data, error } = await db().rpc("price_quote", { p_event: eventId, p_people: people, p_combos: combos, p_coupon: coupon || null });
  if (error) return { ok: false, error: friendlyError(error.message), field: /coupon/.test(error.message) ? "coupon" : undefined };
  return { ok: true, quote: data as Quote };
}

export async function placeOrder(eventId: number, sessionId: number | null, buyer: Omit<Buyer, "adult">, people: Person[], combos: ComboPick[], coupon: string):
  Promise<{ ok: true; order: Order; tickets: { code: string; name: string }[] } | { ok: false; error: string; field?: string }> {
  const { data, error } = await db().rpc("place_order", {
    p_event: eventId, p_session: sessionId, p_buyer: buyer, p_people: people, p_combos: combos, p_coupon: coupon || null,
  });
  if (error) {
    const dup = error.code === "23505" ? "duplicate" : error.message;
    return { ok: false, error: friendlyError(dup), field: /coupon/.test(error.message) ? "coupon" : undefined };
  }
  const r = data as { order: Order; tickets: { code: string; name: string }[] };
  return { ok: true, order: r.order, tickets: r.tickets };
}

export async function getOrder(code: string): Promise<{ order: Order; tickets: (Ticket & { checkins: { day: string }[] })[] } | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(code)) return null;
  const order = unwrap(await db().from("orders").select("*").eq("code", code).maybeSingle()) as Order | null;
  if (!order) return null;
  const tickets = unwrap(await db().from("tickets").select("*, checkins(day)").eq("order_id", order.id).order("position")) as (Ticket & { checkins: { day: string }[] })[];
  return { order, tickets };
}

export async function cancelSelf(code: string): Promise<"ok" | "not_allowed" | "not_found"> {
  return unwrap(await db().rpc("cancel_self", { p_code: code })) as "ok" | "not_allowed" | "not_found";
}

export type PaymentOutcome = "confirmed" | "already" | "no_seat" | "amount_mismatch" | "not_found" | "invalid_state";

export async function confirmPayment(code: string, mpPaymentId: string, amountCents: number): Promise<PaymentOutcome> {
  return unwrap(await db().rpc("confirm_payment", { p_code: code, p_mp_payment_id: mpPaymentId, p_amount_cents: amountCents })) as PaymentOutcome;
}

export async function startOffered(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().rpc("start_offered", { p_code: code });
  return error ? { ok: false, error: friendlyError(error.message) } : { ok: true };
}

/** Posição na fila (1 = próximo) contando só compras ainda não chamadas. */
export async function waitlistPosition(o: Order): Promise<number> {
  const { count } = await db().from("orders").select("id", { count: "exact", head: true })
    .eq("event_id", o.event_id).eq("status", "waitlist").is("offered_until", null).lt("created_at", o.created_at);
  return (count ?? 0) + 1;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${(user ?? "").slice(0, 2)}***@${domain ?? ""}`;
}
