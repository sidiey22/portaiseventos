// Vitrine pública para o site da igreja: só os campos permitidos podem sair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin, minPrice, toPublic } from "../lib/public-events.ts";

const ALLOWED_KEYS = ["nome", "resumo", "local", "inicio", "fim", "gratuito", "preco_a_partir_centavos", "vendas_abertas", "esgotado", "imagem", "link"].sort();

// Evento "cheio", como vem do banco, com campos que NUNCA podem vazar.
const row = {
  id: 7, slug: "culto da virada", name: "Culto da Virada", summary: "Último culto do ano", description: "texto longo",
  place_name: "Templo", place_address: "Av. José dos Santos Diniz, 1180", place_lat: -19.9, place_lng: -44.0,
  starts_at: "2026-12-31T22:00:00Z", ends_at: null, kind: "paid" as const, capacity: 300, status: "published",
  banner_path: "x.jpg", age_ref_date: null,
  age_bands: [{ id: 1, event_id: 7, min_age: 0, max_age: 5, discount_type: "free" as const, discount_value: 0 }, { id: 2, event_id: 7, min_age: 6, max_age: 12, discount_type: "percent" as const, discount_value: 50 }],
  lots: [{ id: 1, price_cents: 5000 }], orders: [{ buyer_cpf: "12345678900", buyer_email: "a@b.c" }], questions: [], combos: [],
};

test("só os campos permitidos saem, sem CPF, email, endereço ou ids", () => {
  const p = toPublic(row, { seatsLeft: 10, lotPrice: 5000, salesOpen: true }, "https://portaiseventos.com/", null);
  assert.deepEqual(Object.keys(p).sort(), ALLOWED_KEYS);
  const json = JSON.stringify(p);
  for (const leak of ["12345678900", "a@b.c", "1180", "texto longo", "capacity", "\"id\"", "-19.9"]) assert.ok(!json.includes(leak), leak);
});

test("preço a partir de considera desconto por idade (não a faixa grátis)", () => {
  assert.equal(minPrice(5000, row.age_bands), 2500);
  const p = toPublic(row, { seatsLeft: 0, lotPrice: 5000, salesOpen: true }, "https://portaiseventos.com", null);
  assert.equal(p.preco_a_partir_centavos, 2500);
  assert.equal(p.esgotado, true);
  assert.equal(p.link, "https://portaiseventos.com/eventos/culto%20da%20virada");
});

test("gratuito não tem preço", () => {
  const p = toPublic({ ...row, kind: "free" }, { seatsLeft: 5, lotPrice: null, salesOpen: true }, "https://portaiseventos.com", null);
  assert.equal(p.gratuito, true);
  assert.equal(p.preco_a_partir_centavos, null);
});

test("CORS só para o site da igreja", () => {
  assert.equal(allowedOrigin("https://portaiseternos.com.br"), "https://portaiseternos.com.br");
  assert.equal(allowedOrigin("https://www.portaiseternos.com.br"), "https://www.portaiseternos.com.br");
  assert.equal(allowedOrigin("https://portaiseternos.com.br.evil.com"), null);
  assert.equal(allowedOrigin("https://outro-site.com"), null);
  assert.equal(allowedOrigin(null), null);
});
