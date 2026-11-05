import { db, unwrap } from "./supabase.ts";
import { ageAt, dayLabel } from "./time.ts";
import { formatCpf } from "./cpf.ts";
import { refDate, type EventFull } from "./events.ts";
import { ORDER_STATUS, type OrderStatus } from "./types.ts";

export type Row = {
  ticketCode: string; name: string; gender: "F" | "M"; birth: string; age: number | null; bandId: number | null;
  lotId: number | null; lotName: string; comboName: string; price: number; couponShare: number;
  status: OrderStatus; orderCode: string; createdAt: string; checkins: string[]; answers: Record<string, unknown>;
  buyer: { name: string; email: string; phone: string; cpf: string }; orderTotal: number; position: number;
};

export type Filters = { gender?: string; lot?: string; status?: string; band?: string; ck?: string; q?: string; qv?: string };

export async function loadRows(e: EventFull): Promise<Row[]> {
  const data = unwrap(await db().from("tickets")
    .select("code, name, gender, birth_date, lot_id, combo_id, price_cents, position, orders!inner(code, status, created_at, ticket_count, total_cents, coupon_discount_cents, buyer_name, buyer_email, buyer_phone, buyer_cpf), ticket_answers(question_id, value), checkins(day)")
    .eq("event_id", e.id).limit(5000)) as unknown as {
      code: string; name: string; gender: "F" | "M"; birth_date: string; lot_id: number | null; combo_id: number | null; price_cents: number; position: number;
      orders: { code: string; status: OrderStatus; created_at: string; ticket_count: number; total_cents: number; coupon_discount_cents: number; buyer_name: string; buyer_email: string; buyer_phone: string; buyer_cpf: string };
      ticket_answers: { question_id: number; value: unknown }[]; checkins: { day: string }[];
    }[];
  const ref = refDate(e);
  return data.map((t) => {
    const age = ageAt(t.birth_date, ref);
    const band = age === null ? null : e.age_bands.find((b) => age >= b.min_age && age <= b.max_age) ?? null;
    return {
      ticketCode: t.code, name: t.name, gender: t.gender, birth: t.birth_date, age, bandId: band?.id ?? null,
      lotId: t.lot_id, lotName: e.lots.find((l) => l.id === t.lot_id)?.name ?? "", comboName: e.combos.find((c) => c.id === t.combo_id)?.name ?? "",
      price: t.price_cents, couponShare: t.orders.coupon_discount_cents / t.orders.ticket_count,
      status: t.orders.status, orderCode: t.orders.code, createdAt: t.orders.created_at, checkins: t.checkins.map((c) => c.day).sort(),
      answers: Object.fromEntries(t.ticket_answers.map((a) => [String(a.question_id), a.value])),
      buyer: { name: t.orders.buyer_name, email: t.orders.buyer_email, phone: t.orders.buyer_phone, cpf: t.orders.buyer_cpf },
      orderTotal: t.orders.total_cents, position: t.position,
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.position - b.position);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const answerText = (v: unknown) => Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);

export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => {
    if (f.gender && r.gender !== f.gender) return false;
    if (f.lot && String(r.lotId) !== f.lot) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.band) { if (f.band === "none" ? r.bandId !== null : String(r.bandId) !== f.band) return false; }
    if (f.ck === "yes" && !r.checkins.length) return false;
    if (f.ck === "no" && r.checkins.length) return false;
    if (f.q && f.qv) {
      const v = r.answers[f.q];
      if (Array.isArray(v) ? !v.map(String).includes(f.qv) : !(String(v ?? "") === f.qv || norm(String(v ?? "")).includes(norm(f.qv)))) return false;
    }
    return true;
  });
}

export function tableRows(e: EventFull, rows: Row[], includeCpf: boolean): string[][] {
  const head = ["Participante", "Gênero", "Data de nascimento", "Idade", "Lote ou combo", "Situação", "Check-ins", ...e.questions.map((q) => q.label),
    "Comprador", "Email", "Telefone", ...(includeCpf ? ["CPF do comprador"] : []), "Valor do ingresso", "Código da compra"];
  return [head, ...rows.map((r) => [
    r.name, r.gender === "F" ? "Feminino" : "Masculino", r.birth.split("-").reverse().join("/"), r.age == null ? "" : String(r.age),
    r.comboName || r.lotName, ORDER_STATUS[r.status], r.checkins.map(dayLabel).join(" "), ...e.questions.map((q) => answerText(r.answers[String(q.id)])),
    r.buyer.name, r.buyer.email, r.buyer.phone, ...(includeCpf ? [formatCpf(r.buyer.cpf)] : []), ((r.price - r.couponShare) / 100).toFixed(2).replace(".", ","), r.orderCode,
  ])];
}

export function toCsv(table: string[][]): string {
  // Proteção contra fórmulas maliciosas ao abrir no Excel (=, +, -, @ no começo da célula).
  const cell = (v: string) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + table.map((l) => l.map(cell).join(";")).join("\r\n");
}
