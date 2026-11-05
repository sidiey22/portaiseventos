import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { publicUrl } from "./mail.ts";

// Mercado Pago (Checkout Pro). O token fica só no servidor (MERCADOPAGO_ACCESS_TOKEN).
const API = "https://api.mercadopago.com";
export const mpEnabled = () => Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** Cria o checkout da compra inteira e devolve o link de pagamento (cartão ou Pix). */
export async function createCheckout(o: { code: string; eventName: string; ticketCount: number; totalCents: number; buyerEmail: string; buyerName: string; expiresAt: string }): Promise<string> {
  const pref = await mp<{ init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": `pref-${o.code}-${o.totalCents}` },
    body: JSON.stringify({
      items: [{ id: o.code, title: `${o.eventName} · ${o.ticketCount} ${o.ticketCount === 1 ? "ingresso" : "ingressos"}`, quantity: 1, unit_price: o.totalCents / 100, currency_id: "BRL" }],
      payer: { email: o.buyerEmail, name: o.buyerName },
      external_reference: o.code,
      notification_url: publicUrl("/api/webhooks/mercadopago"),
      back_urls: { success: publicUrl(`/compra/${o.code}`), pending: publicUrl(`/compra/${o.code}`), failure: publicUrl(`/compra/${o.code}`) },
      auto_return: "approved",
      expires: true,
      expiration_date_to: o.expiresAt,
      payment_methods: { installments: 1, excluded_payment_types: [{ id: "ticket" }] },
      statement_descriptor: "PORTAIS EVENTOS",
    }),
  });
  return pref.init_point;
}

export type MpPayment = { id: number; status: string; external_reference: string | null; transaction_amount: number };

export async function getPayment(id: string): Promise<MpPayment> {
  return mp<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`);
}

/** Pagamento aprovado mais recente de uma compra (para o reembolso). */
export async function findApprovedPayment(orderCode: string): Promise<MpPayment | null> {
  const r = await mp<{ results: MpPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(orderCode)}&status=approved&sort=date_created&criteria=desc`);
  return r.results[0] ?? null;
}

/** Reembolso total. */
export async function refundPayment(paymentId: string): Promise<{ id: number; amount: number }> {
  return mp(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, { method: "POST", headers: { "X-Idempotency-Key": randomUUID() }, body: "{}" });
}

/**
 * Confere a assinatura do aviso (webhook) do Mercado Pago.
 * Cabeçalho x-signature: "ts=...,v1=..."; texto assinado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 */
export function validSignature(signature: string | null, requestId: string | null, dataId: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
