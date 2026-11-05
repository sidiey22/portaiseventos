"use server";

import { requireStaff } from "@/lib/staff";
import { db } from "@/lib/supabase";
import { dayKey } from "@/lib/time";
import { allow } from "@/lib/rate-limit";

export type CheckinResult = { ok: boolean; message: string; name?: string };
const MSG: Record<string, string> = {
  already: "já entrou hoje.", not_confirmed: "Esta compra não está confirmada.", wrong_event: "Este ingresso é de outro evento.",
  wrong_day: "Hoje não é dia deste evento.", not_found: "QR code não reconhecido. Peça para a pessoa abrir o email com os ingressos.",
  forbidden: "Você não tem acesso ao check-in deste evento.",
};

/** Check-in de um participante no dia de hoje. A permissão é conferida de novo dentro do banco. */
export async function checkInAction(eventId: number, raw: string): Promise<CheckinResult> {
  const s = await requireStaff();
  if (!allow(`ck:${s.id}`, 120, 60_000)) return { ok: false, message: "Muitas leituras seguidas. Aguarde um instante." };
  const code = String(raw ?? "").trim().replace(/^PE-/, "");
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(code)) return { ok: false, message: MSG.not_found! };
  const { data, error } = await db().rpc("check_in", { p_user: s.id, p_event: Number(eventId), p_ticket_code: code, p_day: dayKey(new Date()) });
  if (error) return { ok: false, message: "Não foi possível registrar agora. Tente de novo." };
  const { data: t } = await db().from("tickets").select("name").eq("code", code).eq("event_id", Number(eventId)).maybeSingle();
  const name = t?.name as string | undefined;
  if (data === "ok") return { ok: true, message: `${name}: entrada liberada.`, name };
  if (data === "already") return { ok: false, message: `${name} ${MSG.already}`, name };
  return { ok: false, message: MSG[String(data)] ?? "QR code não reconhecido." };
}
