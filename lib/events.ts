import { sb, unwrap } from "./supabase.ts";
import { seatsTaken } from "./registration.ts";

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "50", "50,00", "1.250,50" -> centavos. Retorna null se inválido ou <= 0. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 10_000_000 ? cents : null;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type NewEvent = {
  name: string;
  description: string;
  location: string;
  startsAtIso: string | null;
  kind: string;
  capacity: number;
};

export async function createEvent(input: NewEvent, now: Date = new Date()): Promise<Result<{ id: number; slug: string }>> {
  const name = input.name.trim();
  const location = input.location.trim();
  if (name.length < 3) return { ok: false, error: "Informe o nome do evento." };
  if (location.length < 2) return { ok: false, error: "Informe o local." };
  if (!input.startsAtIso) return { ok: false, error: "Informe a data e a hora." };
  if (new Date(input.startsAtIso).getTime() <= now.getTime()) return { ok: false, error: "A data do evento precisa estar no futuro." };
  if (input.kind !== "paid" && input.kind !== "free") return { ok: false, error: "Escolha se o evento é pago ou gratuito." };
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100_000) {
    return { ok: false, error: "A quantidade de vagas precisa estar entre 1 e 100.000." };
  }

  const base = slugify(name) || "evento";
  const used = new Set(
    (unwrap(await sb().from("events").select("slug").like("slug", `${base}%`)) as { slug: string }[]).map((r) => r.slug),
  );
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

  const { data, error } = await sb()
    .from("events")
    .insert({ slug, name, description: input.description.trim(), location, starts_at: input.startsAtIso, kind: input.kind, capacity: input.capacity, status: "draft" })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Não foi possível criar o evento. Tente de novo." };
  return { ok: true, id: Number(data.id), slug };
}

/** Aumenta (ou ajusta) as vagas. Não deixa reduzir abaixo do que já está ocupado. Vaga nova chama a fila. */
export async function setCapacity(eventId: number, capacity: number): Promise<Result> {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000) return { ok: false, error: "Quantidade de vagas inválida." };
  const taken = await seatsTaken(eventId);
  if (capacity < taken) return { ok: false, error: `Já existem ${taken} vagas ocupadas; não dá para reduzir abaixo disso.` };
  unwrap(await sb().from("events").update({ capacity }).eq("id", eventId));
  unwrap(await sb().rpc("promote_waitlist", { p_event_id: eventId }));
  return { ok: true };
}

export async function setStatus(eventId: number, status: string): Promise<Result> {
  if (status !== "draft" && status !== "published" && status !== "closed") return { ok: false, error: "Status inválido." };
  if (status === "published") {
    const event = unwrap(await sb().from("events").select("kind").eq("id", eventId).maybeSingle()) as { kind: string } | null;
    if (!event) return { ok: false, error: "Evento não encontrado." };
    if (event.kind === "paid") {
      const { count } = await sb().from("lots").select("id", { count: "exact", head: true }).eq("event_id", eventId);
      if (!count) return { ok: false, error: "Crie pelo menos um lote de preço antes de publicar um evento pago." };
    }
  }
  unwrap(await sb().from("events").update({ status }).eq("id", eventId));
  return { ok: true };
}

export async function addSession(eventId: number, name: string, startsAtIso: string | null): Promise<Result> {
  if (name.trim().length < 2) return { ok: false, error: "Informe o nome da sessão." };
  if (!startsAtIso) return { ok: false, error: "Informe a data e a hora da sessão." };
  unwrap(await sb().from("event_sessions").insert({ event_id: eventId, name: name.trim(), starts_at: startsAtIso }));
  return { ok: true };
}

export async function addLot(
  eventId: number,
  input: { name: string; price: string; quantity: number; endsAtIso: string | null },
): Promise<Result> {
  const event = unwrap(await sb().from("events").select("kind").eq("id", eventId).maybeSingle()) as { kind: string } | null;
  if (!event) return { ok: false, error: "Evento não encontrado." };
  if (event.kind !== "paid") return { ok: false, error: "Lotes só existem em eventos pagos." };
  if (input.name.trim().length < 2) return { ok: false, error: "Informe o nome do lote." };
  const cents = parseMoneyToCents(input.price);
  if (cents === null) return { ok: false, error: "Informe um valor válido, por exemplo 50,00." };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, error: "Informe a quantidade de vagas do lote." };
  const last = unwrap(
    await sb().from("lots").select("position").eq("event_id", eventId).order("position", { ascending: false }).limit(1),
  ) as { position: number }[];
  unwrap(
    await sb().from("lots").insert({
      event_id: eventId, name: input.name.trim(), price_cents: cents, quantity: input.quantity,
      ends_at: input.endsAtIso, position: (last[0]?.position ?? 0) + 1,
    }),
  );
  // Lote novo pode abrir venda para quem está na fila.
  unwrap(await sb().rpc("promote_waitlist", { p_event_id: eventId }));
  return { ok: true };
}

/** Só remove lote ou sessão que nunca foi usado por uma inscrição. */
export async function removeLot(lotId: number): Promise<Result> {
  const { count } = await sb().from("registrations").select("id", { count: "exact", head: true }).eq("lot_id", lotId);
  if (count) return { ok: false, error: "Este lote já tem inscrições e não pode ser removido." };
  unwrap(await sb().from("lots").delete().eq("id", lotId));
  return { ok: true };
}

export async function removeSession(sessionId: number): Promise<Result> {
  const { count } = await sb().from("registrations").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  if (count) return { ok: false, error: "Esta sessão já tem inscrições e não pode ser removida." };
  unwrap(await sb().from("event_sessions").delete().eq("id", sessionId));
  return { ok: true };
}
