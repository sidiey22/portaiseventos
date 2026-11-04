// Testes das regras que não dependem do banco. As regras de vaga, lote, fila, pagamento e cancelamento
// moram em funções SQL no Supabase e são testadas direto no banco (ver tests/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf } from "../lib/cpf.ts";
import { validateRegistration } from "../lib/validation.ts";
import { canSelfCancel, type EventRow, type RegistrationRow } from "../lib/registration.ts";
import { createSessionToken, hashPassword, loginAllowed, readSessionToken, recordLoginFailure, verifyPassword } from "../lib/auth.ts";
import { ageOn, localInputToIso } from "../lib/time.ts";
import { parseMoneyToCents, slugify } from "../lib/events.ts";

const NOW = new Date("2026-11-01T15:00:00.000Z");
const CPFS = ["529.982.247-25", "111.444.777-35", "390.533.447-05"];

function person(over: Record<string, unknown> = {}) {
  return {
    name: "Pessoa Teste", email: "p@exemplo.com", phone: "(31) 99999-0000", cpf: CPFS[0]!,
    birthDate: "1990-05-20", guardianPhone: "", sessionId: null as number | null, ...over,
  };
}

test("CPF: aceita válidos e rejeita inválidos", () => {
  for (const cpf of CPFS) assert.equal(isValidCpf(cpf), true, cpf);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("529.982.247-26"), false);
  assert.equal(isValidCpf("123"), false);
});

test("idade e datas no fuso da igreja", () => {
  assert.equal(ageOn("2008-11-02", NOW), 17);
  assert.equal(ageOn("2008-11-01", NOW), 18);
  assert.equal(ageOn("2030-01-01", NOW), null);
  assert.equal(ageOn("2026-02-30", NOW), null);
  assert.equal(localInputToIso("2026-11-20T19:00"), "2026-11-20T22:00:00.000Z");
});

test("menor de idade exige telefone do responsável diferente do seu", () => {
  const opts = { eventHasSessions: false, validSessionIds: [], now: NOW };
  const minor = person({ birthDate: "2012-01-01" });
  assert.equal(validateRegistration(minor, opts).ok, false);
  const ok = validateRegistration({ ...minor, guardianPhone: "(31) 98888-1111" }, opts);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.isMinor, true);
  assert.equal(validateRegistration({ ...minor, guardianPhone: "(31) 99999-0000" }, opts).ok, false);
});

test("sessão obrigatória e válida quando o evento tem sessões", () => {
  const opts = { eventHasSessions: true, validSessionIds: [1, 2], now: NOW };
  assert.equal(validateRegistration(person(), opts).ok, false);
  assert.equal(validateRegistration(person({ sessionId: 99 }), opts).ok, false);
  assert.equal(validateRegistration(person({ sessionId: 2 }), opts).ok, true);
});

test("campos obrigatórios: nome completo, email, telefone com DDD, CPF", () => {
  const opts = { eventHasSessions: false, validSessionIds: [], now: NOW };
  const bad = validateRegistration({ ...person(), name: "João", email: "x", phone: "123", cpf: "111" }, opts);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["cpf", "email", "name", "phone"]);
});

test("cancelamento pela própria pessoa: até 7 dias, nunca depois do evento", () => {
  const event = { starts_at: "2026-12-31T22:00:00.000Z" } as EventRow;
  const reg = { status: "confirmed", confirmed_at: NOW.toISOString(), checked_in_at: null } as RegistrationRow;
  assert.equal(canSelfCancel(reg, event, new Date(NOW.getTime() + 6 * 86_400_000)), true);
  assert.equal(canSelfCancel(reg, event, new Date(NOW.getTime() + 8 * 86_400_000)), false);
  assert.equal(canSelfCancel({ ...reg, checked_in_at: NOW.toISOString() }, event, NOW), false);
  assert.equal(canSelfCancel(reg, { starts_at: "2026-11-01T14:00:00.000Z" } as EventRow, NOW), false);
});

test("senha: confere a certa, recusa a errada; sessão assinada resiste a adulteração", () => {
  const hash = hashPassword("senha-segura-1");
  assert.equal(verifyPassword("senha-segura-1", hash), true);
  assert.equal(verifyPassword("errada-errada", hash), false);
  const user = { id: 7, role: "volunteer" as const, login: "voluntario", name: "V" };
  const token = createSessionToken(user, 1_000);
  assert.equal(readSessionToken(token, 2_000), 7);
  assert.equal(readSessionToken(token, 1_000 + 13 * 3600_000), null);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: 1, exp: 9e15 })).toString("base64url");
  assert.equal(readSessionToken(`${forged}.${sig}`, 2_000), null);
  assert.equal(readSessionToken(`${payload}.xxxx`, 2_000), null);
});

test("limite de tentativas de login", () => {
  const key = "ip:teste";
  for (let i = 0; i < 8; i++) recordLoginFailure(key, 1000);
  assert.equal(loginAllowed(key, 2000), false);
  assert.equal(loginAllowed(key, 1000 + 16 * 60_000), true);
});

test("slug sem acentos", () => {
  assert.equal(slugify("Culto da Virada 2026!"), "culto-da-virada-2026");
  assert.equal(slugify("Acampamento São João"), "acampamento-sao-joao");
});

test("valores em reais viram centavos", () => {
  assert.equal(parseMoneyToCents("50"), 5000);
  assert.equal(parseMoneyToCents("50,00"), 5000);
  assert.equal(parseMoneyToCents("1.250,50"), 125050);
  assert.equal(parseMoneyToCents("R$ 79,90"), 7990);
  assert.equal(parseMoneyToCents("0"), null);
  assert.equal(parseMoneyToCents("abc"), null);
  assert.equal(parseMoneyToCents("-5"), null);
});
