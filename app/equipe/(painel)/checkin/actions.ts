"use server";

import { requireStaff } from "@/lib/staff";
import { db } from "@/lib/supabase";
import { dayKey, dayLabel, formatTime } from "@/lib/time";
import { allow } from "@/lib/rate-limit";

/**
 * Resultado de uma leitura. A decisão é sempre do servidor (função `check_in` no banco); a tela só mostra o que vier aqui.
 * Só carrega o necessário para o check-in: nome do participante, nome do evento, dia e horário. Nunca CPF, telefone, email ou valores.
 */
export type CheckinStatus = "ok" | "already" | "wrong_event" | "forbidden" | "cancelled" | "unpaid" | "wrong_day" | "invalid" | "busy" | "error";
export type CheckinResult = {
  ok: boolean; status: CheckinStatus; title: string; message: string;
  name?: string; eventName?: string; dayText?: string; time?: string; firstTime?: string; today?: number;
};

const bad = (status: CheckinStatus, title: string, message: string, extra: Partial<CheckinResult> = {}): CheckinResult => ({ ok: false, status, title, message, ...extra });

/** Quantos check-ins já foram feitos hoje neste evento. */
async function countToday(eventId: number, day: string): Promise<number> {
  const { count } = await db().from("checkins").select("ticket_id, tickets!inner(event_id)", { count: "exact", head: true }).eq("tickets.event_id", eventId).eq("day", day);
  return count ?? 0;
}

/** Check-in de um participante no dia de hoje. A permissão é conferida de novo dentro do banco. */
export async function checkInAction(eventId: number, raw: string): Promise<CheckinResult> {
  const s = await requireStaff();
  if (!allow(`ck:${s.id}`, 120, 60_000)) return bad("busy", "Muitas leituras seguidas", "Aguarde um instante e leia de novo.");
  const code = String(raw ?? "").trim().replace(/^PE-/, "");
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(code)) return bad("invalid", "QR code inválido", "Este QR code não é um ingresso do Portais Eventos. Peça para a pessoa abrir o email dos ingressos.");
  const id = Number(eventId), day = dayKey(new Date()), nowIso = new Date().toISOString();
  const { data, error } = await db().rpc("check_in", { p_user: s.id, p_event: id, p_ticket_code: code, p_day: day });
  if (error) return bad("error", "Não foi possível registrar", "Tente ler de novo. Se continuar, use a busca por nome.");
  const status = String(data);
  if (status === "forbidden") return bad("forbidden", "Sem acesso a este evento", "Você não está na equipe de credenciamento deste evento.");
  if (status === "not_found") return bad("invalid", "QR code não reconhecido", "Este ingresso não existe. Peça para a pessoa abrir o email dos ingressos.");
  if (status === "wrong_event") return bad("wrong_event", "Ingresso de outro evento", "Este QR code não vale para o evento que está aberto no check-in.");

  // A partir daqui o ingresso é deste evento e o credenciador tem acesso: já pode mostrar o nome do participante.
  const { data: t } = await db().from("tickets").select("id, name, orders!inner(status)").eq("code", code).eq("event_id", id).maybeSingle();
  const name = (t?.name as string | undefined) ?? undefined;
  const orderStatus = (t?.orders as unknown as { status?: string } | null)?.status;
  const { data: ev } = await db().from("events").select("name").eq("id", id).maybeSingle();
  const eventName = (ev?.name as string | undefined) ?? undefined;
  const base = { name, eventName, dayText: dayLabel(day) };

  if (status === "not_confirmed") {
    if (orderStatus === "cancelled") return bad("cancelled", "Ingresso cancelado ou reembolsado", "Esta compra foi cancelada. Não libere a entrada.", base);
    return bad("unpaid", "Pagamento não confirmado", "A compra deste ingresso não está paga. Não libere a entrada.", base);
  }
  if (status === "wrong_day") return bad("wrong_day", "Hoje não é dia deste evento", "O check-in só funciona nos dias do evento.", base);

  const today = await countToday(id, day);
  if (status === "ok") return { ok: true, status: "ok", title: "Check-in realizado", message: `${name ?? "Participante"}: entrada liberada.`, ...base, time: formatTime(nowIso), today };
  if (status === "already") {
    const { data: first } = await db().from("checkins").select("checked_at").eq("ticket_id", t?.id as number).eq("day", day).maybeSingle();
    return bad("already", "Check-in já realizado", `${name ?? "Este participante"} já entrou hoje.`, { ...base, firstTime: first?.checked_at ? formatTime(first.checked_at as string) : undefined, today });
  }
  return bad("invalid", "QR code não reconhecido", "Não foi possível validar este ingresso.");
}
