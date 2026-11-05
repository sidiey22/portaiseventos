import { db, unwrap } from "./supabase.ts";
import type { AgeBand, Combo, EventRow, Lot, Question, Session } from "./types.ts";

export type EventFull = EventRow & { lots: Lot[]; age_bands: AgeBand[]; combos: Combo[]; questions: Question[]; sessions: Session[] };

export async function getEvent(id: number): Promise<EventFull | null> {
  const r = unwrap(await db().from("events")
    .select("*, lots(*), age_bands(*), combos(*), questions(*), sessions:event_sessions(*)")
    .eq("id", id).maybeSingle()) as EventFull | null;
  return r ? sortEvent(r) : null;
}

export async function getPublishedBySlug(slug: string): Promise<EventFull | null> {
  const r = unwrap(await db().from("events")
    .select("*, lots(*), age_bands(*), combos(*), questions(*), sessions:event_sessions(*)")
    .eq("slug", slug).eq("status", "published").maybeSingle()) as EventFull | null;
  return r ? sortEvent(r) : null;
}

function sortEvent(e: EventFull): EventFull {
  e.lots.sort((a, b) => a.position - b.position);
  e.age_bands.sort((a, b) => a.min_age - b.min_age);
  e.questions.sort((a, b) => a.position - b.position || a.id - b.id);
  e.sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  e.combos.sort((a, b) => a.id - b.id);
  return e;
}

export async function expireStale(): Promise<void> {
  await db().rpc("expire_stale");
}

export async function seatsTaken(eventId: number): Promise<number> {
  return Number(unwrap(await db().rpc("seats_taken", { p_event: eventId })));
}

export async function lotSold(lotId: number): Promise<number> {
  return Number(unwrap(await db().rpc("lot_sold", { p_lot: lotId })));
}

export async function currentLot(eventId: number): Promise<Lot | null> {
  const l = unwrap(await db().rpc("current_lot", { p_event: eventId })) as Partial<Lot> | null;
  return l && l.id != null ? (l as Lot) : null;
}

export type Availability = { seatsLeft: number; lot: Lot | null; nextLot: Lot | null; salesOpen: boolean };

export async function availability(e: EventFull): Promise<Availability> {
  const [taken, lot] = await Promise.all([seatsTaken(e.id), e.kind === "paid" ? currentLot(e.id) : Promise.resolve(null)]);
  const now = Date.now();
  const nextLot = e.lots.filter((l) => l.starts_at && new Date(l.starts_at).getTime() > now)
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))[0] ?? null;
  return { seatsLeft: Math.max(0, e.capacity - taken), lot, nextLot, salesOpen: e.kind === "free" || lot !== null };
}

export function bannerUrl(path: string | null): string | null {
  if (!path) return null;
  return db().storage.from("banners").getPublicUrl(path).data.publicUrl;
}

export function refDate(e: EventRow): string {
  return e.age_ref_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(e.starts_at));
}

export function bandLabel(b: AgeBand): string {
  const what = b.discount_type === "free" ? "grátis" : b.discount_type === "percent" ? `${b.discount_value}% de desconto`
    : `${(b.discount_value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
  return `${b.min_age} a ${b.max_age} anos: ${what}`;
}
