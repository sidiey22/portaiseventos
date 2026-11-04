import { sb, unwrap } from "./supabase.ts";
import { validateRegistration, type FieldErrors, type RegistrationInput } from "./validation.ts";

export const RESERVATION_MINUTES = 10;
export const CANCEL_WINDOW_DAYS = 7;

export type EventRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  location: string;
  starts_at: string;
  kind: "paid" | "free";
  capacity: number;
  status: "draft" | "published" | "closed";
};

export type Lot = {
  id: number;
  name: string;
  price_cents: number;
  quantity: number;
  ends_at: string | null;
  position: number;
};

export type RegistrationRow = {
  id: number;
  code: string;
  event_id: number;
  session_id: number | null;
  lot_id: number | null;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birth_date: string;
  guardian_phone: string | null;
  status: "pending" | "confirmed" | "waitlist" | "cancelled" | "expired";
  price_cents: number;
  expires_at: string | null;
  offered_until: string | null;
  offer_notified_at: string | null;
  checked_in_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
};

// As regras de vaga, lote, fila e pagamento moram no banco (funções SQL), para que duas pessoas
// nunca levem a mesma última vaga. Aqui ficam só as chamadas e a validação dos campos.

/** Libera reservas vencidas. O banco também faz isso sozinho a cada minuto (pg_cron). */
export async function expireStale(): Promise<void> {
  unwrap(await sb().rpc("expire_stale"));
}

export async function getLots(eventId: number): Promise<Lot[]> {
  return unwrap(
    await sb().from("lots").select("id, name, price_cents, quantity, ends_at, position").eq("event_id", eventId).order("position"),
  ) as Lot[];
}

export async function seatsTaken(eventId: number): Promise<number> {
  return Number(unwrap(await sb().rpc("seats_taken", { p_event_id: eventId })));
}

export async function currentLot(eventId: number): Promise<Lot | null> {
  const lot = unwrap(await sb().rpc("current_lot", { p_event_id: eventId })) as Partial<Lot> | null;
  return lot && lot.id != null ? (lot as Lot) : null;
}

export type Availability = {
  seatsLeft: number;
  lot: Lot | null; // lote vigente (eventos pagos)
  open: boolean; // há vaga e, se pago, há lote vigente
};

export async function getAvailability(event: EventRow): Promise<Availability> {
  const [taken, lot] = await Promise.all([seatsTaken(event.id), event.kind === "paid" ? currentLot(event.id) : Promise.resolve(null)]);
  const seatsLeft = Math.max(0, event.capacity - taken);
  return { seatsLeft, lot, open: seatsLeft > 0 && (event.kind === "free" || lot !== null) };
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  return (unwrap(await sb().from("events").select("*").eq("slug", slug).eq("status", "published").maybeSingle()) as EventRow | null) ?? null;
}

export async function getEventById(id: number): Promise<EventRow | null> {
  return (unwrap(await sb().from("events").select("*").eq("id", id).maybeSingle()) as EventRow | null) ?? null;
}

export type RegisterResult =
  | { ok: true; outcome: "confirmed" | "pending" | "waitlist"; registration: RegistrationRow }
  | { ok: false; code: "validation"; errors: FieldErrors }
  | { ok: false; code: "closed" | "duplicate" | "not_found"; message: string };

/**
 * Cria uma inscrição.
 * - Evento gratuito com vaga: confirmada na hora.
 * - Evento pago com vaga: pendente por 10 minutos, até o pagamento confirmar.
 * - Sem vaga: entra na fila de espera.
 */
export async function register(eventId: number, input: RegistrationInput, now: Date = new Date()): Promise<RegisterResult> {
  const event = await getEventById(eventId);
  if (!event) return { ok: false, code: "not_found", message: "Evento não encontrado." };
  if (event.status !== "published") {
    return { ok: false, code: "closed", message: "As inscrições para este evento não estão abertas." };
  }

  const sessions = unwrap(await sb().from("event_sessions").select("id").eq("event_id", eventId)) as { id: number }[];
  const checked = validateRegistration(input, {
    eventHasSessions: sessions.length > 0,
    validSessionIds: sessions.map((s) => s.id),
    now,
  });
  if (!checked.ok) return { ok: false, code: "validation", errors: checked.errors };
  const d = checked.value;

  const { data, error } = await sb().rpc("register_attendee", {
    p_event_id: eventId,
    p_session_id: d.sessionId,
    p_name: d.name,
    p_email: d.email,
    p_phone: d.phone,
    p_cpf: d.cpf,
    p_birth: d.birthDate,
    p_guardian: d.guardianPhone ?? "",
  });
  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return { ok: false, code: "duplicate", message: "Este CPF já tem uma inscrição neste evento." };
    }
    if (error.message.includes("event_closed")) return { ok: false, code: "closed", message: "As inscrições para este evento não estão abertas." };
    if (error.message.includes("event_not_found")) return { ok: false, code: "not_found", message: "Evento não encontrado." };
    if (error.message.includes("session_")) return { ok: false, code: "validation", errors: { sessionId: "Escolha uma sessão." } };
    throw new Error(error.message);
  }
  const registration = data as RegistrationRow;
  return { ok: true, outcome: registration.status as "confirmed" | "pending" | "waitlist", registration };
}

export type PaymentOutcome = "confirmed" | "already" | "no_seat" | "amount_mismatch" | "not_found" | "invalid_state";

/** Confirma um pagamento. Seguro para chamadas repetidas (o webhook pode chegar mais de uma vez). */
export async function confirmPayment(code: string, mpPaymentId: string, amountCents: number): Promise<PaymentOutcome> {
  return unwrap(
    await sb().rpc("confirm_payment", { p_code: code, p_mp_payment_id: mpPaymentId, p_amount_cents: amountCents }),
  ) as PaymentOutcome;
}

export async function findByCode(code: string): Promise<RegistrationRow | null> {
  return (unwrap(await sb().from("registrations").select("*").eq("code", code).maybeSingle()) as RegistrationRow | null) ?? null;
}

/** A pessoa pode cancelar sozinha até 7 dias após a inscrição confirmada (e antes do evento). O banco confere de novo. */
export function canSelfCancel(reg: RegistrationRow, event: EventRow, now: Date): boolean {
  if (reg.status !== "confirmed" || !reg.confirmed_at || reg.checked_in_at) return false;
  if (new Date(event.starts_at).getTime() <= now.getTime()) return false;
  const limit = new Date(reg.confirmed_at).getTime() + CANCEL_WINDOW_DAYS * 86_400_000;
  return now.getTime() <= limit;
}

export async function cancelSelf(code: string): Promise<"ok" | "not_allowed" | "not_found"> {
  return unwrap(await sb().rpc("cancel_self", { p_code: code })) as "ok" | "not_allowed" | "not_found";
}
