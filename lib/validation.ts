import { isValidCpf, onlyDigits } from "./cpf.ts";
import { ageOn } from "./time.ts";
import type { Question } from "./types.ts";

export type FieldErrors = Record<string, string>;
export type Person = { name: string; gender: string; birth_date: string; answers: Record<string, unknown> };
export type Buyer = { name: string; email: string; phone: string; cpf: string; adult: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidBrPhone(digits: string): boolean {
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[1-9]\d(9\d{8}|[2-9]\d{7})$/.test(local);
}
export const isEmail = (v: string) => EMAIL.test(v.trim());
const fullName = (v: string) => { const n = v.trim().replace(/\s+/g, " "); return n.length >= 3 && n.includes(" ") && n.length <= 120; };

function cleanAnswer(q: Question, raw: unknown): unknown {
  if (q.type === "multi_choice") {
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter((o) => q.options.includes(o));
    return list.length ? list : null;
  }
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (q.type === "yes_no") return v === "sim" ? "sim" : v === "não" ? "não" : null;
  if (q.type === "single_choice") return q.options.includes(v) ? v : null;
  if (q.type === "number") return /^-?\d+([.,]\d+)?$/.test(v) ? Number(v.replace(",", ".")) : null;
  if (q.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  return v.slice(0, q.type === "long_text" ? 2000 : 200);
}

/** Valida comprador e participantes. As faixas de idade, vagas e preços são conferidas de novo no banco. */
export function validateOrder(buyer: Buyer, people: Person[], questions: Question[], now = new Date()):
  { ok: true; buyer: Omit<Buyer, "adult">; people: Person[] } | { ok: false; errors: FieldErrors } {
  const e: FieldErrors = {};
  if (people.length < 1 || people.length > 20) e.qty = "Escolha de 1 a 20 ingressos.";
  const clean: Person[] = people.map((p, i) => {
    const k = `p${i}-`;
    if (!fullName(p.name)) e[k + "name"] = "Informe o nome completo.";
    if (p.gender !== "F" && p.gender !== "M") e[k + "gender"] = "Escolha o gênero.";
    if (ageOn(p.birth_date, now) === null) e[k + "birth"] = "Informe uma data de nascimento válida.";
    const answers: Record<string, unknown> = {};
    for (const q of questions) {
      const v = cleanAnswer(q, p.answers[String(q.id)]);
      if (v === null) { if (q.required) e[`${k}q${q.id}`] = "Responda esta pergunta."; }
      else answers[String(q.id)] = v;
    }
    return { name: p.name.trim().replace(/\s+/g, " "), gender: p.gender, birth_date: p.birth_date, answers };
  });
  if (!fullName(buyer.name)) e["b-name"] = "Informe o nome completo.";
  if (!isEmail(buyer.email)) e["b-email"] = "Informe um email válido.";
  if (!isValidBrPhone(onlyDigits(buyer.phone))) e["b-phone"] = "Informe um telefone com DDD.";
  if (!isValidCpf(buyer.cpf)) e["b-cpf"] = "CPF inválido.";
  if (!buyer.adult) e["b-adult"] = "A compra precisa ser feita por um adulto responsável.";
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    buyer: { name: buyer.name.trim().replace(/\s+/g, " "), email: buyer.email.trim().toLowerCase(), phone: onlyDigits(buyer.phone), cpf: onlyDigits(buyer.cpf) },
    people: clean,
  };
}

export function slugify(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** "50", "50,00", "1.250,50" -> centavos. null se inválido ou <= 0. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = String(input ?? "").trim().replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 10_000_000 ? cents : null;
}
