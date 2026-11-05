// Regras que não dependem do banco. As regras de vaga, lote, idade, combo, cupom, fila, pagamento,
// check-in e permissões ficam em funções SQL no Supabase e foram testadas no próprio banco (ver tests/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isValidCpf } from "../lib/cpf.ts";
import { parseMoneyToCents, slugify, validateOrder } from "../lib/validation.ts";
import { ageAt, eventDays, formatRange, localInputToIso } from "../lib/time.ts";
import { allow } from "../lib/rate-limit.ts";
import { applyFilters, tableRows, toCsv, type Row } from "../lib/report.ts";
import { validSignature } from "../lib/mercadopago.ts";
import { friendlyError } from "../lib/errors.ts";
import type { Question } from "../lib/types.ts";

const NOW = new Date("2026-11-04T15:00:00.000Z");
const Q: Question[] = [
  { id: 1, event_id: 1, label: "É batizado?", type: "yes_no", required: true, options: [], position: 1 },
  { id: 2, event_id: 1, label: "Camiseta", type: "single_choice", required: true, options: ["P", "M", "G"], position: 2 },
  { id: 3, event_id: 1, label: "Igreja", type: "short_text", required: false, options: [], position: 3 },
];
const buyer = { name: "Gabriel Souza", email: "G@Exemplo.com ", phone: "(31) 99999-0000", cpf: "529.982.247-25", adult: true };
const person = (o: Record<string, unknown> = {}) => ({ name: "Ana  Souza", gender: "F", birth_date: "2016-05-02", answers: { 1: "sim", 2: "M" } as Record<string, unknown>, ...o });

test("CPF válido e inválido", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("529.982.247-26"), false);
});

test("compra válida: limpa os dados e guarda só respostas das perguntas do evento", () => {
  const r = validateOrder(buyer, [person({ answers: { 1: "sim", 2: "M", 3: "", 99: "x" } })], Q, NOW);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.buyer, { name: "Gabriel Souza", email: "g@exemplo.com", phone: "31999990000", cpf: "52998224725" });
  assert.equal(r.people[0]!.name, "Ana Souza");
  assert.deepEqual(r.people[0]!.answers, { 1: "sim", 2: "M" });
});

test("compra inválida: aponta cada campo", () => {
  const r = validateOrder({ ...buyer, cpf: "123", adult: false, email: "x" }, [person({ name: "Ana", gender: "X", birth_date: "2030-01-01", answers: { 2: "XXL" } })], Q, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  for (const k of ["p0-name", "p0-gender", "p0-birth", "p0-q1", "p0-q2", "b-cpf", "b-adult", "b-email"]) assert.ok(r.errors[k], k);
  assert.equal(validateOrder(buyer, [], Q, NOW).ok, false);
  assert.equal(validateOrder(buyer, Array.from({ length: 21 }, () => person()), Q, NOW).ok, false);
});

test("datas: fuso da igreja, intervalo e dias do evento", () => {
  assert.equal(localInputToIso("2026-11-27T19:00"), "2026-11-27T22:00:00.000Z");
  assert.deepEqual(eventDays("2026-11-27T22:00:00.000Z", "2026-11-29T01:00:00.000Z"), ["2026-11-27", "2026-11-28"]);
  assert.match(formatRange("2026-11-27T22:00:00.000Z", "2026-11-29T01:00:00.000Z"), /^Sexta, 27 de nov às 19:00 até Sábado, 28 de nov, 22:00$/);
  assert.equal(ageAt("2021-11-28", "2026-11-27"), 4);
  assert.equal(ageAt("2021-11-27", "2026-11-27"), 5);
});

test("valores em reais e slug", () => {
  assert.equal(parseMoneyToCents("1.250,50"), 125050);
  assert.equal(parseMoneyToCents("R$ 79,90"), 7990);
  assert.equal(parseMoneyToCents("0"), null);
  assert.equal(slugify("Louvor Jovem 2026!"), "louvor-jovem-2026");
});

test("limite de tentativas", () => {
  for (let i = 0; i < 3; i++) assert.equal(allow("t", 3, 1000, 100), true);
  assert.equal(allow("t", 3, 1000, 200), false);
  assert.equal(allow("t", 3, 1000, 1200), true);
});

test("relatório: filtros e exportação protegida contra fórmulas", () => {
  const base: Row = { ticketCode: "a", name: "Ana", gender: "F", birth: "2016-05-02", age: 10, bandId: 12, lotId: 1, lotName: "1º lote", comboName: "", price: 3500, couponShare: 0, status: "confirmed", orderCode: "c1", createdAt: "2026-11-01T10:00:00Z", checkins: [], answers: { 1: "sim" }, buyer: { name: "=CMD()", email: "a@x.com", phone: "31999990000", cpf: "52998224725" }, orderTotal: 3500, position: 0 };
  const rows = [base, { ...base, ticketCode: "b", name: "Bruno", gender: "M" as const, bandId: null, checkins: ["2026-11-27"], answers: { 1: "não" } }];
  assert.equal(applyFilters(rows, { gender: "F" }).length, 1);
  assert.equal(applyFilters(rows, { band: "none" })[0]!.name, "Bruno");
  assert.equal(applyFilters(rows, { ck: "yes" }).length, 1);
  assert.equal(applyFilters(rows, { q: "1", qv: "sim" }).length, 1);
  const e = { questions: Q.slice(0, 1) } as Parameters<typeof tableRows>[0];
  const t = tableRows(e, rows, false);
  assert.ok(!t[0]!.includes("CPF do comprador"), "gerente não exporta CPF");
  assert.ok(tableRows(e, rows, true)[0]!.includes("CPF do comprador"));
  assert.match(toCsv(t), /'=CMD\(\)/);
});

test("assinatura do webhook do Mercado Pago", () => {
  const secret = "segredo", ts = "1700000000", id = "123456", req = "req-1";
  const v1 = createHmac("sha256", secret).update(`id:${id};request-id:${req};ts:${ts};`).digest("hex");
  assert.equal(validSignature(`ts=${ts},v1=${v1}`, req, id, secret), true);
  assert.equal(validSignature(`ts=${ts},v1=${v1}`, req, "999", secret), false);
  assert.equal(validSignature(null, req, id, secret), false);
  assert.equal(validSignature(`ts=${ts},v1=${v1}`, req, id, ""), false);
});

test("mensagens de erro do banco em português", () => {
  assert.equal(friendlyError("not_enough_seats:2"), "Restam só 2 vagas. Diminua a quantidade de ingressos.");
  assert.equal(friendlyError("duplicate"), "Este CPF já tem uma compra ativa neste evento.");
  assert.match(friendlyError("qualquer coisa"), /Tente de novo/);
});
